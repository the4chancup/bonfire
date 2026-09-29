// SPDX-License-Identifier: AGPL-3.0-or-later

use crate::config::HttpEndpoint;
use crate::discovery_cache::{
    DiscoveryResponse, branding_string, discovery_endpoint, is_self_hosted, sized_url,
};
use crate::state::{AppState, MAX_STATIC_TEXT_FILE_BYTES, read_bounded_file};
use axum::{
    extract::State,
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use std::path::Path;

pub async fn version_json(State(state): State<AppState>) -> Response {
    let mut result = serve_static_text_file(&state, "version.json", "application/json").await;

    if result.status() == StatusCode::NOT_FOUND && !state.config.build_version.is_empty() {
        let body = serde_json::json!({ "version": state.config.build_version });
        result = axum::Json(body).into_response();
        result
            .headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    }

    result
}

pub async fn manifest_json(State(state): State<AppState>) -> Response {
    let discovery = state.discovery_cache.get().await;
    let static_cdn_endpoint = runtime_static_cdn_endpoint(&state).await;
    serve_static_text_file_with_substitutions(
        &state,
        "manifest.json",
        "application/manifest+json",
        static_cdn_endpoint.as_ref(),
        Some(&state.config.manifest_scope_extensions),
        |text| apply_instance_branding(text, discovery.as_ref()),
    )
    .await
}

fn with_scope_extensions(text: String, origins: &[String]) -> String {
    if origins.is_empty() {
        return text;
    }
    let Ok(serde_json::Value::Object(mut manifest)) = serde_json::from_str(&text) else {
        return text;
    };
    let scope_extensions = origins
        .iter()
        .map(|origin| serde_json::json!({ "type": "origin", "origin": origin }))
        .collect();
    manifest.insert(
        "scope_extensions".to_owned(),
        serde_json::Value::Array(scope_extensions),
    );
    serde_json::to_string_pretty(&manifest).unwrap_or(text)
}

/// Rewrite the built manifest to the instance's own branding. Only applies to self-hosted
/// instances; each field is taken only when the discovery document publishes a non-empty value.
fn apply_instance_branding(text: String, discovery: Option<&DiscoveryResponse>) -> String {
    let Some(discovery) = discovery.filter(|d| is_self_hosted(d)) else {
        return text;
    };
    let product_name = branding_string(discovery, "product_name");
    let theme_color = branding_string(discovery, "theme_color");
    let icon_url = branding_string(discovery, "icon_url");
    if product_name.is_none() && theme_color.is_none() && icon_url.is_none() {
        return text;
    }
    let Ok(serde_json::Value::Object(mut manifest)) = serde_json::from_str(&text) else {
        return text;
    };
    if let Some(product_name) = product_name {
        manifest.insert("name".to_owned(), product_name.into());
        manifest.insert("short_name".to_owned(), product_name.into());
        if let Some(description) = manifest.get("description").and_then(|v| v.as_str()) {
            let description = description.replace("Fluxer", product_name);
            manifest.insert("description".to_owned(), description.into());
        }
    }
    if let Some(theme_color) = theme_color {
        manifest.insert("theme_color".to_owned(), theme_color.into());
    }
    if let Some(icon_url) = icon_url {
        manifest.insert(
            "icons".to_owned(),
            serde_json::json!([
                {
                    "src": sized_url(icon_url, 512),
                    "sizes": "512x512",
                    "purpose": "any"
                },
                {
                    "src": sized_url(icon_url, 256),
                    "sizes": "256x256",
                    "purpose": "any"
                }
            ]),
        );
    }
    serde_json::to_string_pretty(&manifest).unwrap_or(text)
}

fn substitute_placeholders(
    text: &str,
    static_cdn_endpoint: &str,
    scope_extensions: Option<&[String]>,
) -> String {
    let text = text.replace("{{STATIC_CDN_ENDPOINT}}", static_cdn_endpoint);
    match scope_extensions {
        Some(origins) => with_scope_extensions(text, origins),
        None => text,
    }
}

pub async fn browserconfig_xml(State(state): State<AppState>) -> Response {
    let static_cdn_endpoint = runtime_static_cdn_endpoint(&state).await;
    serve_static_text_file_with_cdn(
        &state,
        "browserconfig.xml",
        "application/xml; charset=utf-8",
        static_cdn_endpoint.as_ref(),
    )
    .await
}

pub async fn service_worker(State(state): State<AppState>) -> Response {
    serve_static_text_file(&state, "sw.js", "application/javascript; charset=utf-8").await
}

pub async fn service_worker_map(State(state): State<AppState>) -> Response {
    serve_static_text_file(&state, "sw.js.map", "application/json").await
}

async fn runtime_static_cdn_endpoint(state: &AppState) -> Option<HttpEndpoint> {
    if let Some(discovery) = state.discovery_cache.get().await
        && let Some(endpoint) = discovery_endpoint(&discovery, "static_cdn")
    {
        return Some(endpoint);
    }

    state.config.static_cdn_endpoint.clone()
}

async fn serve_static_text_file(state: &AppState, filename: &str, content_type: &str) -> Response {
    serve_static_text_file_with_cdn(state, filename, content_type, None).await
}

async fn serve_static_text_file_with_cdn(
    state: &AppState,
    filename: &str,
    content_type: &str,
    static_cdn_endpoint: Option<&HttpEndpoint>,
) -> Response {
    serve_static_text_file_with_substitutions(
        state,
        filename,
        content_type,
        static_cdn_endpoint,
        None,
        |text| text,
    )
    .await
}

async fn serve_static_text_file_with_substitutions(
    state: &AppState,
    filename: &str,
    content_type: &str,
    static_cdn_endpoint: Option<&HttpEndpoint>,
    scope_extensions: Option<&[String]>,
    transform: impl FnOnce(String) -> String,
) -> Response {
    let static_dir = state.config.static_dir.as_str();
    let file_path = Path::new(static_dir).join(filename);

    let Ok(_read_slot) = state.budgets.local_read_slots.try_acquire() else {
        return super::capacity_refused_response();
    };

    let resolved = match tokio::fs::canonicalize(&file_path).await {
        Ok(p) => p,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };
    let base = match tokio::fs::canonicalize(static_dir).await {
        Ok(p) => p,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };
    if !resolved.starts_with(&base) {
        return StatusCode::NOT_FOUND.into_response();
    }

    let content = match read_bounded_file(&resolved, MAX_STATIC_TEXT_FILE_BYTES).await {
        Ok(bytes) => bytes,
        Err(error) if error.is_not_found() => return StatusCode::NOT_FOUND.into_response(),
        Err(error) => {
            tracing::error!(file = filename, %error, "refusing to serve static text file");
            return StatusCode::NOT_FOUND.into_response();
        }
    };

    let replacement = static_cdn_endpoint.map_or("", HttpEndpoint::as_str);
    let body: axum::body::Body = match std::str::from_utf8(&content) {
        Ok(text) => transform(substitute_placeholders(text, replacement, scope_extensions))
            .into_bytes()
            .into(),
        Err(_) => content.into(),
    };

    let mut response = body.into_response();
    if let Ok(ct) = HeaderValue::from_str(content_type) {
        response.headers_mut().insert(header::CONTENT_TYPE, ct);
    }
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    response
}

pub fn guess_mime(path: &str) -> &'static str {
    let ext = match path.rfind('.') {
        Some(i) => &path[i..],
        None => return "application/octet-stream",
    };
    match ext.to_ascii_lowercase().as_str() {
        ".html" | ".htm" => "text/html; charset=utf-8",
        ".js" | ".mjs" => "application/javascript; charset=utf-8",
        ".css" => "text/css; charset=utf-8",
        ".json" => "application/json; charset=utf-8",
        ".png" => "image/png",
        ".jpg" | ".jpeg" => "image/jpeg",
        ".gif" => "image/gif",
        ".webp" => "image/webp",
        ".avif" => "image/avif",
        ".svg" => "image/svg+xml",
        ".ico" => "image/x-icon",
        ".woff" => "font/woff",
        ".woff2" => "font/woff2",
        ".ttf" => "font/ttf",
        ".otf" => "font/otf",
        ".eot" => "application/vnd.ms-fontobject",
        ".mp3" => "audio/mpeg",
        ".mp4" => "video/mp4",
        ".webm" => "video/webm",
        ".ogg" => "audio/ogg",
        ".wav" => "audio/wav",
        ".pdf" => "application/pdf",
        ".txt" => "text/plain; charset=utf-8",
        ".xml" => "application/xml; charset=utf-8",
        ".webmanifest" => "application/manifest+json",
        ".map" => "application/json",
        ".wasm" => "application/wasm",
        _ => "application/octet-stream",
    }
}

pub const CORS_ALLOW_ANY_VALUE: &str = "*";

pub fn is_font_mime(mime_type: &str) -> bool {
    matches!(
        mime_type,
        "font/woff" | "font/woff2" | "font/ttf" | "font/otf" | "application/vnd.ms-fontobject"
    )
}

pub const LONG_LIVED_ASSET_CACHE_CONTROL: &str = "public, max-age=31536000, immutable";
pub const REVALIDATED_ASSET_CACHE_CONTROL: &str = "public, max-age=3600, must-revalidate";

pub fn is_hashed_asset(path: &str) -> bool {
    let filename = path.rsplit('/').next().unwrap_or(path);
    let Some(last_dot) = filename.rfind('.') else {
        return false;
    };
    let stem = &filename[..last_dot];
    if stem.split('.').next().is_some_and(is_content_hash) {
        return true;
    }
    ['.', '-'].iter().any(|sep| {
        stem.rfind(*sep)
            .is_some_and(|sep_pos| is_content_hash(&stem[sep_pos + 1..]))
    })
}

pub fn asset_cache_control(path: &str) -> &'static str {
    if is_hashed_asset(path) {
        LONG_LIVED_ASSET_CACHE_CONTROL
    } else {
        REVALIDATED_ASSET_CACHE_CONTROL
    }
}

fn is_content_hash(value: &str) -> bool {
    value.len() >= 8 && value.chars().all(|c| c.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;

    const BUILT_MANIFEST: &str = r#"{
  "id": "/",
  "start_url": "/app",
  "scope": "/",
  "scope_extensions": [],
  "icons": [
    {
      "src": "{{STATIC_CDN_ENDPOINT}}/web/android-chrome-192x192.png"
    }
  ]
}"#;

    const BUILT_MANIFEST_FULL: &str = r##"{
  "name": "Fluxer",
  "short_name": "Fluxer",
  "description": "Fluxer is a free and open source instant messaging and VoIP platform.",
  "id": "/",
  "start_url": "/app",
  "scope": "/",
  "scope_extensions": [],
  "theme_color": "#4641D9",
  "icons": [
    {
      "src": "{{STATIC_CDN_ENDPOINT}}/web/android-chrome-192x192.png",
      "sizes": "192x192"
    }
  ]
}"##;

    fn discovery(data: &str) -> crate::discovery_cache::DiscoveryResponse {
        serde_json::from_str(data).expect("test discovery must be valid JSON")
    }

    fn branded_manifest(discovery_data: &str, built: &str) -> String {
        let discovery = discovery(discovery_data);
        let text = substitute_placeholders(built, "https://fluxerstatic.com", Some(&[]));
        apply_instance_branding(text, Some(&discovery))
    }

    const SELF_HOSTED_BRANDED: &str = r##"{"features":{"self_hosted":true},"app_public":{"branding":{"product_name":"Bonfire","theme_color":"#129648","icon_url":"https://media.example.test/icons/app.png","favicon_url":"https://media.example.test/icons/clover.png"}}}"##;

    #[test]
    fn a_self_hosted_manifest_takes_the_instance_branding() {
        let text = branded_manifest(SELF_HOSTED_BRANDED, BUILT_MANIFEST_FULL);
        let manifest: serde_json::Value =
            serde_json::from_str(&text).expect("branded manifest must stay valid JSON");

        assert_eq!(manifest["name"], "Bonfire");
        assert_eq!(manifest["short_name"], "Bonfire");
        assert_eq!(
            manifest["description"],
            "Bonfire is a free and open source instant messaging and VoIP platform."
        );
        assert_eq!(manifest["theme_color"], "#129648");
        assert_eq!(
            manifest["icons"],
            serde_json::json!([
                {
                    "src": "https://media.example.test/icons/app.png?size=512",
                    "sizes": "512x512",
                    "purpose": "any"
                },
                {
                    "src": "https://media.example.test/icons/app.png?size=256",
                    "sizes": "256x256",
                    "purpose": "any"
                }
            ])
        );
        assert_eq!(manifest["id"], "/");
        assert_eq!(manifest["start_url"], "/app");
        assert_eq!(manifest["scope"], "/");
        assert_eq!(manifest["scope_extensions"], serde_json::json!([]));
    }

    #[test]
    fn the_manifest_icon_url_keeps_an_existing_query() {
        let text = branded_manifest(
            r#"{"features":{"self_hosted":true},"app_public":{"branding":{"icon_url":"https://media.example.test/icons/app.png?v=2"}}}"#,
            BUILT_MANIFEST_FULL,
        );
        let manifest: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(
            manifest["icons"][0]["src"],
            "https://media.example.test/icons/app.png?v=2&size=512"
        );
        assert_eq!(
            manifest["icons"][1]["src"],
            "https://media.example.test/icons/app.png?v=2&size=256"
        );
    }

    #[test]
    fn a_self_hosted_manifest_without_branding_stays_as_built() {
        for discovery_data in [
            r#"{"features":{"self_hosted":true}}"#,
            r#"{"features":{"self_hosted":true},"app_public":{"branding":{"product_name":"  ","theme_color":"","icon_url":""}}}"#,
        ] {
            let substituted =
                substitute_placeholders(BUILT_MANIFEST_FULL, "https://fluxerstatic.com", Some(&[]));
            assert_eq!(
                branded_manifest(discovery_data, BUILT_MANIFEST_FULL),
                substituted
            );
        }
    }

    #[test]
    fn the_official_instance_manifest_stays_as_built() {
        let substituted =
            substitute_placeholders(BUILT_MANIFEST_FULL, "https://fluxerstatic.com", Some(&[]));
        assert_eq!(
            branded_manifest(
                r#"{"features":{"self_hosted":false},"app_public":{"branding":{"product_name":"Bonfire"}}}"#,
                BUILT_MANIFEST_FULL
            ),
            substituted
        );
    }

    fn substituted_manifest(origins: &[&str]) -> serde_json::Value {
        let origins: Vec<String> = origins.iter().map(|origin| (*origin).to_owned()).collect();
        let text =
            substitute_placeholders(BUILT_MANIFEST, "https://fluxerstatic.com", Some(&origins));
        serde_json::from_str(&text).expect("substituted manifest must stay valid JSON")
    }

    #[test]
    fn manifest_scope_extensions_default_to_the_built_empty_list() {
        let manifest = substituted_manifest(&[]);
        assert_eq!(manifest["scope_extensions"], serde_json::json!([]));
        assert_eq!(
            manifest["icons"][0]["src"],
            "https://fluxerstatic.com/web/android-chrome-192x192.png"
        );
    }

    #[test]
    fn manifest_scope_extensions_list_each_configured_origin() {
        let manifest = substituted_manifest(&["https://fluxer.com", "https://canary.fluxer.com"]);
        assert_eq!(
            manifest["scope_extensions"],
            serde_json::json!([
                { "type": "origin", "origin": "https://fluxer.com" },
                { "type": "origin", "origin": "https://canary.fluxer.com" }
            ])
        );
        assert_eq!(manifest["id"], "/");
        assert_eq!(manifest["start_url"], "/app");
    }

    #[test]
    fn manifest_scope_extensions_are_added_when_the_build_has_none() {
        let text = substitute_placeholders(
            r#"{"id":"/"}"#,
            "",
            Some(&["https://fluxer.com".to_owned()]),
        );
        let manifest: serde_json::Value = serde_json::from_str(&text).expect("valid JSON");
        assert_eq!(
            manifest["scope_extensions"],
            serde_json::json!([{ "type": "origin", "origin": "https://fluxer.com" }])
        );
    }

    #[test]
    fn other_text_files_are_left_alone() {
        let origins = ["https://fluxer.com".to_owned()];
        assert_eq!(
            substitute_placeholders(
                "not json {{STATIC_CDN_ENDPOINT}}",
                "https://cdn",
                Some(&origins)
            ),
            "not json https://cdn"
        );
        assert_eq!(
            substitute_placeholders(BUILT_MANIFEST, "", None),
            BUILT_MANIFEST.replace("{{STATIC_CDN_ENDPOINT}}", "")
        );
    }

    #[test]
    fn mime_html() {
        assert_eq!(guess_mime("i.html"), "text/html; charset=utf-8");
    }
    #[test]
    fn mime_js() {
        assert_eq!(guess_mime("a.js"), "application/javascript; charset=utf-8");
    }
    #[test]
    fn mime_css() {
        assert_eq!(guess_mime("s.css"), "text/css; charset=utf-8");
    }
    #[test]
    fn mime_json() {
        assert_eq!(guess_mime("d.json"), "application/json; charset=utf-8");
    }
    #[test]
    fn mime_wasm() {
        assert_eq!(guess_mime("m.wasm"), "application/wasm");
    }
    #[test]
    fn mime_svg() {
        assert_eq!(guess_mime("i.svg"), "image/svg+xml");
    }
    #[test]
    fn mime_png() {
        assert_eq!(guess_mime("p.png"), "image/png");
    }
    #[test]
    fn mime_jpg() {
        assert_eq!(guess_mime("p.jpg"), "image/jpeg");
    }
    #[test]
    fn mime_webp() {
        assert_eq!(guess_mime("p.webp"), "image/webp");
    }
    #[test]
    fn mime_avif() {
        assert_eq!(guess_mime("p.avif"), "image/avif");
    }
    #[test]
    fn mime_ico() {
        assert_eq!(guess_mime("f.ico"), "image/x-icon");
    }
    #[test]
    fn mime_woff2() {
        assert_eq!(guess_mime("f.woff2"), "font/woff2");
    }
    #[test]
    fn mime_mp4() {
        assert_eq!(guess_mime("c.mp4"), "video/mp4");
    }

    #[test]
    fn mime_unknown() {
        assert_eq!(guess_mime("f.xyz"), "application/octet-stream");
    }

    #[test]
    fn mime_no_ext() {
        assert_eq!(guess_mime("LICENSE"), "application/octet-stream");
    }

    #[test]
    fn mime_case_insensitive() {
        assert_eq!(guess_mime("F.HTML"), "text/html; charset=utf-8");
        assert_eq!(guess_mime("F.JS"), "application/javascript; charset=utf-8");
    }

    #[test]
    fn hashed_asset_positive() {
        assert!(is_hashed_asset("app.a1b2c3d4.js"));
        assert!(is_hashed_asset("style-abcdef01.css"));
    }

    #[test]
    fn hashed_asset_accepts_bare_contenthash_filenames() {
        assert!(is_hashed_asset("assets/469e0b8f10c496a1.css"));
        assert!(is_hashed_asset("assets/a79f1c3119cd700d.woff2"));
        assert!(is_hashed_asset("/assets/488b87159423ca35.js"));
    }

    #[test]
    fn hashed_asset_accepts_the_contenthash_worker_bundle_name() {
        assert!(
            is_hashed_asset("assets/2d715e4730758083.worker.js"),
            "rspack emits workers as assets/[contenthash:16].worker.js"
        );
    }

    #[test]
    fn hashed_asset_negative() {
        assert!(!is_hashed_asset("app.js"));
        assert!(!is_hashed_asset("style.css"));
        assert!(!is_hashed_asset("a79f1c3119cd700d/app.js"));
    }

    #[test]
    fn the_bundled_font_licences_are_not_treated_as_content_hashed() {
        assert!(!is_hashed_asset("assets/fonts-NOTICE.txt"));
        assert!(!is_hashed_asset("assets/fonts-LICENSE-IBM-PLEX.txt"));
    }

    #[test]
    fn only_a_content_hashed_asset_is_promised_to_never_change() {
        assert_eq!(
            asset_cache_control("assets/469e0b8f10c496a1.css"),
            LONG_LIVED_ASSET_CACHE_CONTROL
        );
        assert_eq!(
            asset_cache_control("assets/fonts-NOTICE.txt"),
            REVALIDATED_ASSET_CACHE_CONTROL
        );
    }
}

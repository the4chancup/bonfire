// SPDX-License-Identifier: AGPL-3.0-or-later

export type UpdaterDownloadOption = {
	format: ManualDesktopFormat;
	label: string;
	url: string;
	suggestedName?: string;
	sha256?: string | null;
};

export const UPDATE_BASE_URL = 'https://github.com/the4chancup/bonfire/releases/latest/download';
export const DOWNLOAD_PAGE_URL = 'https://github.com/the4chancup/bonfire/releases';

export const MANUAL_DESKTOP_FORMATS = ['setup', 'dmg', 'zip', 'appimage', 'deb', 'rpm', 'tar_gz'] as const;

export type ManualDesktopFormat = (typeof MANUAL_DESKTOP_FORMATS)[number];
export type ManualLatestFile = {url: string; sha256: string | null};
type LinuxManualDesktopFormat = Extract<ManualDesktopFormat, 'appimage' | 'deb' | 'rpm' | 'tar_gz'>;

export type ManualLatestInfo = {
	version: string;
	pubDate: string | null;
	files: Partial<Record<ManualDesktopFormat, ManualLatestFile>>;
};

function getManualDownloadFormatPreference(): Array<ManualDesktopFormat> {
	if (process.platform === 'linux') {
		return ['appimage', 'deb', 'rpm', 'tar_gz'];
	}
	if (process.platform === 'darwin') {
		return ['dmg', 'zip'];
	}
	if (process.platform === 'win32') {
		return ['setup'];
	}
	return [];
}

const LINUX_MANUAL_FORMAT_LABELS: Record<LinuxManualDesktopFormat, string> = {
	appimage: 'AppImage',
	deb: 'DEB package',
	rpm: 'RPM package',
	tar_gz: 'tar.gz archive',
};

function isLinuxManualDesktopFormat(format: ManualDesktopFormat): format is LinuxManualDesktopFormat {
	return format === 'appimage' || format === 'deb' || format === 'rpm' || format === 'tar_gz';
}

export function buildReleasePageUrl(version: string): string {
	return `https://github.com/the4chancup/bonfire/releases/tag/desktop-v${version}`;
}

function suggestedNameFromUrl(url: string): string | undefined {
	const name = url.split(/[?#]/)[0].split('/').at(-1);
	return name || undefined;
}

export function getManualDownloadOptions(info: ManualLatestInfo): Array<UpdaterDownloadOption> {
	if (process.platform !== 'linux') {
		return [];
	}
	return getManualDownloadFormatPreference()
		.filter(isLinuxManualDesktopFormat)
		.filter((format) => info.files[format] != null)
		.map((format) => {
			const file = info.files[format]!;
			return {
				format,
				label: LINUX_MANUAL_FORMAT_LABELS[format],
				url: file.url,
				suggestedName: suggestedNameFromUrl(file.url),
				sha256: file.sha256 ?? null,
			};
		});
}

export function getManualDownloadUrl(info: ManualLatestInfo): string {
	const [preferredOption] = getManualDownloadOptions(info);
	if (preferredOption) {
		return preferredOption.url;
	}
	for (const format of getManualDownloadFormatPreference()) {
		const url = info.files[format]?.url;
		if (url) {
			return url;
		}
	}
	return DOWNLOAD_PAGE_URL;
}

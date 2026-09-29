// SPDX-License-Identifier: AGPL-3.0-or-later

import {Routes} from '@app/app/Routes';
import RuntimeConfig from '@app/features/app/state/RuntimeConfig';

export function getTermsUrl(): string | null {
	return RuntimeConfig.termsUrl ?? (RuntimeConfig.isSelfHosted() ? null : Routes.terms());
}

export function getPrivacyUrl(): string | null {
	return RuntimeConfig.privacyUrl ?? (RuntimeConfig.isSelfHosted() ? null : Routes.privacy());
}

export function getCommunityGuidelinesUrl(): string | null {
	return RuntimeConfig.isSelfHosted() ? null : Routes.guidelines();
}

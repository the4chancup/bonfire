// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import * as UserCommands from '@app/features/user/commands/UserCommands';
import styles from '@app/features/user/components/modals/tabs/privacy_safety_tab/DataDeletionTab.module.css';
import {
	DataRequestModal,
	EXPORT_TAB_DESCRIPTION,
} from '@app/features/user/components/modals/tabs/privacy_safety_tab/data_request_modal/DataRequestModal';
import * as FormUtils from '@app/lib/forms';
import type {HarvestStatusResponse} from '@fluxer/schema/src/domains/user/UserHarvestSchemas';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useState} from 'react';

const HARVEST_IN_PROGRESS_DESCRIPTOR = msg({
	message: 'Data export in progress ({percent}%)',
	comment: 'Privacy > Data export: status shown while a data export harvest is pending or processing.',
});
const HARVEST_FAILED_DESCRIPTOR = msg({
	message: 'Your last data export failed. You can request a new one.',
	comment: 'Privacy > Data export: status shown when the latest data export harvest failed.',
});
const HARVEST_DOWNLOAD_DESCRIPTOR = msg({
	message: 'Download archive',
	comment: 'Privacy > Data export: button that downloads the completed data export archive.',
});

export const DataExportTabContent: React.FC = observer(() => {
	const {i18n} = useLingui();
	const [latestHarvest, setLatestHarvest] = useState<HarvestStatusResponse | null>(null);
	const refreshHarvest = useCallback(() => {
		UserCommands.getLatestHarvest()
			.then(setLatestHarvest)
			.catch(() => setLatestHarvest(null));
	}, []);
	useEffect(refreshHarvest, [refreshHarvest]);
	const harvestInProgress = latestHarvest?.status === 'pending' || latestHarvest?.status === 'processing';
	useEffect(() => {
		if (!harvestInProgress) return;
		const timer = setInterval(refreshHarvest, 10_000);
		return () => clearInterval(timer);
	}, [harvestInProgress, refreshHarvest]);
	const handleOpen = useCallback(() => {
		ModalCommands.push(
			modal(() => (
				<DataRequestModal
					variant="export"
					onExportRequested={refreshHarvest}
					data-flx="user.privacy-safety-tab.data-export-tab.data-request-modal"
				/>
			)),
		);
	}, [refreshHarvest]);
	const handleDownload = useCallback(
		(harvestId: string) => {
			UserCommands.getHarvestDownloadUrl(harvestId)
				.then(({download_url}) => {
					const anchor = document.createElement('a');
					anchor.href = download_url;
					anchor.download = '';
					document.body.appendChild(anchor);
					anchor.click();
					anchor.remove();
				})
				.catch((error) => FormUtils.pushApiErrorModal(i18n, error));
		},
		[i18n],
	);
	const harvestDownloadable =
		latestHarvest?.status === 'completed' &&
		(latestHarvest.expires_at === null || new Date(latestHarvest.expires_at).getTime() > Date.now());
	return (
		<div
			className={styles.deleteSection}
			data-flx="user.privacy-safety-tab.data-export-tab.data-export-tab-content.delete-section"
		>
			<Modal.Description
				className={styles.warningText}
				data-flx="user.privacy-safety-tab.data-export-tab.data-export-tab-content.warning-text"
			>
				{i18n._(EXPORT_TAB_DESCRIPTION)}
			</Modal.Description>
			{harvestInProgress && latestHarvest && (
				<Modal.Description
					className={styles.warningText}
					data-flx="user.privacy-safety-tab.data-export-tab.data-export-tab-content.harvest-in-progress"
				>
					{i18n._(HARVEST_IN_PROGRESS_DESCRIPTOR, {percent: Math.round(latestHarvest.progress_percent)})}
				</Modal.Description>
			)}
			{latestHarvest?.status === 'failed' && (
				<Modal.Description
					className={styles.warningText}
					data-flx="user.privacy-safety-tab.data-export-tab.data-export-tab-content.harvest-failed"
				>
					{i18n._(HARVEST_FAILED_DESCRIPTOR)}
				</Modal.Description>
			)}
			<Button
				variant="primary"
				onClick={handleOpen}
				data-flx="user.privacy-safety-tab.data-export-tab.data-export-tab-content.button.open-modal"
			>
				<Trans>Export my data</Trans>
			</Button>
			{harvestDownloadable && latestHarvest && (
				<Button
					variant="primary"
					onClick={() => handleDownload(latestHarvest.harvest_id)}
					data-flx="user.privacy-safety-tab.data-export-tab.data-export-tab-content.button.download"
				>
					{i18n._(HARVEST_DOWNLOAD_DESCRIPTOR)}
				</Button>
			)}
		</div>
	);
});

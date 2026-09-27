// SPDX-License-Identifier: AGPL-3.0-or-later

import {UnclaimedAccountAlert} from '@app/features/app/components/dialogs/components/UnclaimedAccountAlert';
import {openClaimAccountModal} from '@app/features/auth/components/modals/ClaimAccountModal';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {PasswordChangeModal} from '@app/features/user/components/modals/PasswordChangeModal';
import styles from '@app/features/user/components/modals/tabs/account_security_tab/AccountTab.module.css';
import type {User} from '@app/features/user/models/User';
import * as DateUtils from '@app/features/user/utils/DateFormatting';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';

interface AccountTabProps {
	user: User;
	isClaimed: boolean;
}

export const AccountTabContent: React.FC<AccountTabProps> = observer(({user, isClaimed}) => {
	const {i18n} = useLingui();
	const passwordRow = (
		<div className={styles.divider} data-flx="user.account-security-tab.account-tab.account-tab-content.password-block">
			<div className={styles.row} data-flx="user.account-security-tab.account-tab.account-tab-content.password-row">
				{isClaimed ? (
					<>
						<div
							className={styles.rowContent}
							data-flx="user.account-security-tab.account-tab.account-tab-content.password-row-content"
						>
							<div
								className={styles.label}
								data-flx="user.account-security-tab.account-tab.account-tab-content.password-label"
							>
								<Trans>Password</Trans>
							</div>
							<div
								className={styles.description}
								data-flx="user.account-security-tab.account-tab.account-tab-content.password-description"
							>
								{user.passwordLastChangedAt ? (
									<Trans>Last changed: {DateUtils.getRelativeDateString(user.passwordLastChangedAt, i18n)}</Trans>
								) : (
									<Trans>Last changed: never</Trans>
								)}
							</div>
						</div>
						<Button
							small={true}
							onClick={() =>
								ModalCommands.push(
									modal(() => (
										<PasswordChangeModal data-flx="user.account-security-tab.account-tab.account-tab-content.password-change-modal" />
									)),
								)
							}
							data-flx="user.account-security-tab.account-tab.account-tab-content.change-password-button"
						>
							<Trans>Change password</Trans>
						</Button>
					</>
				) : (
					<>
						<div
							className={styles.rowContent}
							data-flx="user.account-security-tab.account-tab.account-tab-content.password-row-content"
						>
							<div
								className={styles.label}
								data-flx="user.account-security-tab.account-tab.account-tab-content.password-label"
							>
								<Trans>Password</Trans>
							</div>
							<div
								className={styles.warningText}
								data-flx="user.account-security-tab.account-tab.account-tab-content.password-warning"
							>
								<Trans>No password set</Trans>
							</div>
						</div>
						<Button
							small={true}
							className={styles.claimButton}
							fitContent
							onClick={() => openClaimAccountModal()}
							data-flx="user.account-security-tab.account-tab.account-tab-content.set-password-button"
						>
							<Trans>Set password</Trans>
						</Button>
					</>
				)}
			</div>
		</div>
	);
	return (
		<>
			{!isClaimed && (
				<UnclaimedAccountAlert data-flx="user.account-security-tab.account-tab.account-tab-content.unclaimed-account-alert" />
			)}
			<div className={styles.accountRows} data-flx="user.account-security-tab.account-tab.account-tab-content.rows">
				{passwordRow}
			</div>
		</>
	);
});

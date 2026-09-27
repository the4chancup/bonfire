// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {useFormSubmit} from '@app/features/app/hooks/useFormSubmit';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {Form} from '@app/features/ui/components/form/Form';
import {Input} from '@app/features/ui/components/form/FormInput';
import * as UserCommands from '@app/features/user/commands/UserCommands';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useCallback} from 'react';
import {useForm} from 'react-hook-form';

const PASSWORDS_DO_NOT_MATCH_DESCRIPTOR = msg({
	message: 'Passwords do not match',
	comment: 'Label in the password change modal. Keep the tone plain and specific.',
});
const UPDATE_YOUR_PASSWORD_DESCRIPTOR = msg({
	message: 'Update your password',
	comment: 'Short label in the password change modal. Keep it concise. Keep the tone plain and specific.',
});
const CHANGE_PASSWORD_FORM_DESCRIPTOR = msg({
	message: 'Change password form',
	comment: 'Short label in the password change modal. Keep it concise. Keep the tone plain and specific.',
});
const NEW_PASSWORD_DESCRIPTOR = msg({
	message: 'New password',
	comment: 'Short label in the password change modal. Keep it concise. Keep the tone plain and specific.',
});
const CONFIRM_NEW_PASSWORD_DESCRIPTOR = msg({
	message: 'Confirm new password',
	comment: 'Short label in the password change modal. Keep it concise. Keep the tone plain and specific.',
});
const CURRENT_PASSWORD_DESCRIPTOR = msg({
	message: 'Current password',
	comment: 'Short label in the password change modal. Keep it concise. Keep the tone plain and specific.',
});

interface PasswordForm {
	password: string;
	new_password: string;
	confirm_password: string;
}

export const PasswordChangeModal = observer(() => {
	const {i18n} = useLingui();
	const passwordForm = useForm<PasswordForm>();
	const onPasswordSubmit = useCallback(
		async (data: PasswordForm) => {
			if (data.new_password !== data.confirm_password) {
				passwordForm.setError('confirm_password', {message: i18n._(PASSWORDS_DO_NOT_MATCH_DESCRIPTOR)});
				return;
			}
			await UserCommands.update({password: data.password, new_password: data.new_password});
			ModalCommands.pop();
			ToastCommands.createToast({type: 'success', children: <Trans>Password changed</Trans>});
		},
		[passwordForm, i18n],
	);
	const {handleSubmit: handlePasswordSubmit, isSubmitting: isPasswordSubmitting} = useFormSubmit({
		form: passwordForm,
		onSubmit: onPasswordSubmit,
		defaultErrorField: 'password',
	});
	return (
		<Modal.Root size="small" centered data-flx="user.password-change-modal.modal-root">
			<Modal.Header
				title={i18n._(UPDATE_YOUR_PASSWORD_DESCRIPTOR)}
				data-flx="user.password-change-modal.modal-header"
			/>
			<Modal.Content data-flx="user.password-change-modal.modal-content">
				<Modal.ContentLayout data-flx="user.password-change-modal.modal-content-layout">
					<Form
						form={passwordForm}
						onSubmit={handlePasswordSubmit}
						aria-label={i18n._(CHANGE_PASSWORD_FORM_DESCRIPTOR)}
						data-flx="user.password-change-modal.form.password-submit"
					>
						<Modal.Description data-flx="user.password-change-modal.modal-description">
							<Trans>Enter your current password and choose a new password.</Trans>
						</Modal.Description>
						<Modal.InputGroup data-flx="user.password-change-modal.modal-input-group">
							<Input
								data-flx="user.password-change-modal.input.current-password"
								{...passwordForm.register('password')}
								autoComplete="current-password"
								autoFocus={true}
								error={passwordForm.formState.errors.password?.message}
								label={i18n._(CURRENT_PASSWORD_DESCRIPTOR)}
								maxLength={128}
								placeholder={'•'.repeat(32)}
								required={true}
								type="password"
							/>
							<Input
								data-flx="user.password-change-modal.input.password"
								{...passwordForm.register('new_password')}
								autoComplete="new-password"
								error={passwordForm.formState.errors.new_password?.message}
								label={i18n._(NEW_PASSWORD_DESCRIPTOR)}
								maxLength={128}
								minLength={8}
								placeholder={'•'.repeat(32)}
								required={true}
								type="password"
							/>
							<Input
								data-flx="user.password-change-modal.input.password--2"
								{...passwordForm.register('confirm_password')}
								autoComplete="new-password"
								error={passwordForm.formState.errors.confirm_password?.message}
								label={i18n._(CONFIRM_NEW_PASSWORD_DESCRIPTOR)}
								maxLength={128}
								minLength={8}
								placeholder={'•'.repeat(32)}
								required={true}
								type="password"
							/>
						</Modal.InputGroup>
					</Form>
				</Modal.ContentLayout>
			</Modal.Content>
			<Modal.Footer data-flx="user.password-change-modal.footer">
				<Button onClick={ModalCommands.pop} variant="secondary" data-flx="user.password-change-modal.button.pop">
					<Trans>Cancel</Trans>
				</Button>
				<Button
					onClick={handlePasswordSubmit}
					submitting={isPasswordSubmitting}
					data-flx="user.password-change-modal.button.submit"
				>
					<Trans>Change password</Trans>
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
});

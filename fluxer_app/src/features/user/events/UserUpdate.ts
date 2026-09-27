// SPDX-License-Identifier: AGPL-3.0-or-later

import AccountManager from '@app/features/auth/state/AccountManager';
import accountStorage from '@app/features/auth/state/AccountStorage';
import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import GuildVerification from '@app/features/guild/state/GuildVerification';
import Messages from '@app/features/messaging/state/MessagingMessages';
import Permission from '@app/features/permissions/state/Permission';
import SessionManager from '@app/features/platform/state/AuthSession';
import QuickSwitcher from '@app/features/search/state/QuickSwitcher';
import Users from '@app/features/user/state/Users';
import type {User} from '@fluxer/schema/src/domains/user/UserResponseSchemas';

interface UserUpdatePayload {
	id: string;
	username: string;
	discriminator: string;
	avatar: string | null;
	flags: number;
	is_staff?: boolean;
	global_name?: string | null;
}

export function handleUserUpdate(data: UserUpdatePayload, _context: GatewayHandlerContext): void {
	Users.handleUserUpdate(data as User);
	Messages.handleUserUpdate({user: {id: data.id}});
	Permission.handleUserUpdate(data.id);
	QuickSwitcher.recomputeIfOpen();
	GuildVerification.handleUserUpdate();
	if (data.id === SessionManager.userId) {
		const userData = {
			...SessionManager.currentAccount?.userData,
			username: data.username,
			discriminator: data.discriminator,
			avatar: data.avatar,
			...(data.global_name !== undefined ? {globalName: data.global_name} : {}),
		};
		void accountStorage.updateAccountUserData(data.id, userData);
		AccountManager.updateAccountUserData(data.id, userData);
	}
}

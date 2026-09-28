// SPDX-License-Identifier: AGPL-3.0-or-later

import {createTestAccount, type TestAccount} from '@app/api/auth/tests/AuthTestUtils';
import {createGuildID} from '@app/api/BrandedTypes';
import {
	acceptInvite,
	addMemberRole,
	createChannelInvite,
	createDmChannel,
	createFriendship,
	createGroupDmChannel,
	createGuild,
	createRole,
	updateRole,
} from '@app/api/channel/tests/ChannelTestUtils';
import {loadFixture, sendMessageWithAttachments} from '@app/api/channel/tests/AttachmentTestUtils';
import {getConfig} from '@app/api/Config';
import {type ApiTestHarness, createApiTestHarness} from '@app/api/test/ApiTestHarness';
import {createBuilder} from '@app/api/test/TestRequestBuilder';
import {HTTP_STATUS} from '@app/api/test/TestConstants';
import type {GuildResponse} from '@fluxer/schema/src/domains/guild/GuildResponseSchemas';
import {DEFAULT_PERMISSIONS, Permissions} from '@fluxer/constants/src/ChannelConstants';
import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {afterEach, beforeAll, beforeEach, describe, expect, it} from 'vitest';

async function uploadFormData(harness: ApiTestHarness, token: string, channelId: string) {
	return sendMessageWithAttachments(
		harness,
		token,
		channelId,
		{content: 'dm upload test', attachments: [{id: 0, filename: 'test.png'}]},
		[{index: 0, filename: 'test.png', data: loadFixture('yeah.png')}],
	);
}

async function requestPresignedUpload(
	harness: ApiTestHarness,
	token: string,
	channelId: string,
	expectedStatus: number,
	errorCode?: string,
) {
	return createBuilder<{attachments?: Array<{upload_url: string}>}>(harness, token)
		.post(`/channels/${channelId}/attachments`)
		.body({attachments: [{id: 0, filename: 'test.png', file_size: 128, content_type: 'image/png'}]})
		.expect(expectedStatus, errorCode)
		.execute();
}

async function inviteToGuild(harness: ApiTestHarness, owner: TestAccount, member: TestAccount, guild: GuildResponse) {
	const invite = await createChannelInvite(harness, owner.token, guild.system_channel_id!);
	await acceptInvite(harness, member.token, invite.code);
}

describe('DM upload trusted guild gating', () => {
	let harness: ApiTestHarness;
	let originalTrustedGuildIds: Array<ReturnType<typeof createGuildID>>;
	let originalPresignedEnabled: boolean;

	beforeAll(async () => {
		harness = await createApiTestHarness();
	});

	beforeEach(async () => {
		await harness.reset();
		originalTrustedGuildIds = getConfig().dmUploadTrustedGuildIds;
		originalPresignedEnabled = getConfig().presignedAttachmentUploadsEnabled;
		getConfig().presignedAttachmentUploadsEnabled = true;
	});

	afterEach(() => {
		getConfig().dmUploadTrustedGuildIds = originalTrustedGuildIds;
		getConfig().presignedAttachmentUploadsEnabled = originalPresignedEnabled;
	});

	it('rejects a DM attachment upload when the trusted guild list is empty', async () => {
		getConfig().dmUploadTrustedGuildIds = [];
		const user1 = await createTestAccount(harness);
		const user2 = await createTestAccount(harness);
		await createFriendship(harness, user1, user2);
		const dm = await createDmChannel(harness, user1.token, user2.userId);
		const {response, text} = await uploadFormData(harness, user1.token, dm.id);
		const body = JSON.parse(text) as {code?: string};
		expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
		expect(body.code).toBe(APIErrorCodes.MISSING_PERMISSIONS);
	});

	it('rejects a DM upload for a guild member when @everyone lacks ATTACH_FILES', async () => {
		const owner = await createTestAccount(harness);
		const member = await createTestAccount(harness);
		const other = await createTestAccount(harness);
		const guild = await createGuild(harness, owner.token, 'Trusted Guild No Attach');
		await inviteToGuild(harness, owner, member, guild);
		await updateRole(harness, owner.token, guild.id, guild.id, {
			permissions: (DEFAULT_PERMISSIONS & ~Permissions.ATTACH_FILES).toString(),
		});
		await createFriendship(harness, member, other);
		getConfig().dmUploadTrustedGuildIds = [createGuildID(BigInt(guild.id))];
		const dm = await createDmChannel(harness, member.token, other.userId);
		const {response, text} = await uploadFormData(harness, member.token, dm.id);
		const body = JSON.parse(text) as {code?: string};
		expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
		expect(body.code).toBe(APIErrorCodes.MISSING_PERMISSIONS);
	});

	it('allows a DM upload for a member whose role grants ATTACH_FILES in a trusted guild', async () => {
		const owner = await createTestAccount(harness);
		const member = await createTestAccount(harness);
		const other = await createTestAccount(harness);
		const guild = await createGuild(harness, owner.token, 'Trusted Guild');
		await inviteToGuild(harness, owner, member, guild);
		await updateRole(harness, owner.token, guild.id, guild.id, {
			permissions: (DEFAULT_PERMISSIONS & ~Permissions.ATTACH_FILES).toString(),
		});
		const role = await createRole(harness, owner.token, guild.id, {
			name: 'uploader',
			permissions: (Permissions.VIEW_CHANNEL | Permissions.ATTACH_FILES).toString(),
		});
		await addMemberRole(harness, owner.token, guild.id, member.userId, role.id);
		await createFriendship(harness, member, other);
		getConfig().dmUploadTrustedGuildIds = [createGuildID(BigInt(guild.id))];
		const dm = await createDmChannel(harness, member.token, other.userId);
		const {response} = await uploadFormData(harness, member.token, dm.id);
		expect(response.status).toBe(200);
	});

	it('allows a presigned upload request when the user has ATTACH_FILES in the second listed guild', async () => {
		const owner1 = await createTestAccount(harness);
		const owner2 = await createTestAccount(harness);
		const member = await createTestAccount(harness);
		const other = await createTestAccount(harness);
		const untrustedGuild = await createGuild(harness, owner1.token, 'Unrelated Guild');
		const trustedGuild = await createGuild(harness, owner2.token, 'Second Guild');
		await inviteToGuild(harness, owner2, member, trustedGuild);
		await createFriendship(harness, member, other);
		getConfig().dmUploadTrustedGuildIds = [
			createGuildID(BigInt(untrustedGuild.id)),
			createGuildID(BigInt(trustedGuild.id)),
		];
		const dm = await createDmChannel(harness, member.token, other.userId);
		const json = await requestPresignedUpload(harness, member.token, dm.id, 200);
		expect(json.attachments?.[0]?.upload_url).toBeTruthy();
	});

	it('rejects a group DM upload for a user trusted in no guild', async () => {
		const owner = await createTestAccount(harness);
		const guild = await createGuild(harness, owner.token, 'Trusted Guild Group DM');
		getConfig().dmUploadTrustedGuildIds = [createGuildID(BigInt(guild.id))];
		const untrusted = await createTestAccount(harness);
		const other1 = await createTestAccount(harness);
		const other2 = await createTestAccount(harness);
		await createFriendship(harness, untrusted, other1);
		await createFriendship(harness, untrusted, other2);
		const groupDm = await createGroupDmChannel(harness, untrusted.token, [other1.userId, other2.userId]);
		const {response, text} = await uploadFormData(harness, untrusted.token, groupDm.id);
		const body = JSON.parse(text) as {code?: string};
		expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
		expect(body.code).toBe(APIErrorCodes.MISSING_PERMISSIONS);
	});

	it('rejects a presigned upload request for an untrusted DM user', async () => {
		getConfig().dmUploadTrustedGuildIds = [];
		const user1 = await createTestAccount(harness);
		const user2 = await createTestAccount(harness);
		await createFriendship(harness, user1, user2);
		const dm = await createDmChannel(harness, user1.token, user2.userId);
		await requestPresignedUpload(harness, user1.token, dm.id, HTTP_STATUS.FORBIDDEN, APIErrorCodes.MISSING_PERMISSIONS);
	});
});

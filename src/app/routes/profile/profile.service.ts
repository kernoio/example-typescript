import { getTableClient } from '../../azure-clients';
import HttpException from '../../models/http-exception.model';

const usersTable = () => getTableClient('users');
const followsTable = () => getTableClient('follows');

const findUserByUsername = async (username: string) => {
  const client = usersTable();
  const results = client.listEntities({ queryOptions: { filter: `username eq '${username}'` } });
  for await (const entity of results) {
    return entity as any;
  }
  return null;
};

const isFollowing = async (followerId: string, followingId: string): Promise<boolean> => {
  try {
    await followsTable().getEntity(followerId, followingId);
    return true;
  } catch {
    return false;
  }
};

export const getProfile = async (usernamePayload: string, id?: string) => {
  const user = await findUserByUsername(usernamePayload);

  if (!user) {
    throw new HttpException(404, {});
  }

  const following = id ? await isFollowing(id, user.rowKey) : false;

  return {
    username: user.username,
    bio: user.bio ?? null,
    image: user.image ?? null,
    following,
  };
};

export const followUser = async (usernamePayload: string, id: string) => {
  const user = await findUserByUsername(usernamePayload);

  if (!user) {
    throw new HttpException(404, {});
  }

  await followsTable().createEntity({
    partitionKey: id,
    rowKey: user.rowKey,
  }).catch(() => {});

  return {
    username: user.username,
    bio: user.bio ?? null,
    image: user.image ?? null,
    following: true,
  };
};

export const unfollowUser = async (usernamePayload: string, id: string) => {
  const user = await findUserByUsername(usernamePayload);

  if (!user) {
    throw new HttpException(404, {});
  }

  await followsTable().deleteEntity(id, user.rowKey).catch(() => {});

  return {
    username: user.username,
    bio: user.bio ?? null,
    image: user.image ?? null,
    following: false,
  };
};

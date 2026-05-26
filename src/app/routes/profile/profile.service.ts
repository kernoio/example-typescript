import client from '../../clickhouse-client';
import HttpException from '../../models/http-exception.model';

const buildProfile = (user: any, followedByIds: number[], id?: number) => ({
  username: user.username,
  bio: user.bio,
  image: user.image,
  following: id ? followedByIds.includes(id) : false,
});

export const getProfile = async (usernamePayload: string, id?: number) => {
  const userResult = await client.query({
    query: `SELECT id, username, bio, image FROM users FINAL WHERE username = {username: String} LIMIT 1`,
    query_params: { username: usernamePayload },
    format: 'JSONEachRow',
  });
  const userRows: any[] = await userResult.json();

  if (userRows.length === 0) {
    throw new HttpException(404, {});
  }

  const user = userRows[0];
  const userId = Number(user.id);

  const followsResult = await client.query({
    query: `SELECT followerId FROM follows WHERE followingId = {followingId: UInt32}`,
    query_params: { followingId: userId },
    format: 'JSONEachRow',
  });
  const followsRows: any[] = await followsResult.json();
  const followedByIds = followsRows.map((r: any) => Number(r.followerId));

  return buildProfile(user, followedByIds, id);
};

export const followUser = async (usernamePayload: string, id: number) => {
  const userResult = await client.query({
    query: `SELECT id, username, bio, image FROM users FINAL WHERE username = {username: String} LIMIT 1`,
    query_params: { username: usernamePayload },
    format: 'JSONEachRow',
  });
  const userRows: any[] = await userResult.json();

  if (userRows.length === 0) {
    throw new HttpException(404, {});
  }

  const user = userRows[0];
  const followingId = Number(user.id);

  await client.insert({
    table: 'follows',
    values: [{ followerId: id, followingId }],
    format: 'JSONEachRow',
  });

  const followsResult = await client.query({
    query: `SELECT followerId FROM follows WHERE followingId = {followingId: UInt32}`,
    query_params: { followingId },
    format: 'JSONEachRow',
  });
  const followsRows: any[] = await followsResult.json();
  const followedByIds = followsRows.map((r: any) => Number(r.followerId));

  return buildProfile(user, followedByIds, id);
};

export const unfollowUser = async (usernamePayload: string, id: number) => {
  const userResult = await client.query({
    query: `SELECT id, username, bio, image FROM users FINAL WHERE username = {username: String} LIMIT 1`,
    query_params: { username: usernamePayload },
    format: 'JSONEachRow',
  });
  const userRows: any[] = await userResult.json();

  if (userRows.length === 0) {
    throw new HttpException(404, {});
  }

  const user = userRows[0];
  const followingId = Number(user.id);

  await client.command({
    query: `DELETE FROM follows WHERE followerId = {followerId: UInt32} AND followingId = {followingId: UInt32}`,
    query_params: { followerId: id, followingId },
  });

  const followsResult = await client.query({
    query: `SELECT followerId FROM follows WHERE followingId = {followingId: UInt32}`,
    query_params: { followingId },
    format: 'JSONEachRow',
  });
  const followsRows: any[] = await followsResult.json();
  const followedByIds = followsRows.map((r: any) => Number(r.followerId));

  return buildProfile(user, followedByIds, id);
};

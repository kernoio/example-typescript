import * as bcrypt from 'bcryptjs';
import { RegisterInput } from './register-input.model';
import client from '../../clickhouse-client';
import HttpException from '../../models/http-exception.model';
import { RegisteredUser } from './registered-user.model';
import generateToken from './token.utils';
import { User } from './user.model';

const checkUserUniqueness = async (email: string, username: string) => {
  const emailResult = await client.query({
    query: `SELECT id FROM users FINAL WHERE email = {email: String} LIMIT 1`,
    query_params: { email },
    format: 'JSONEachRow',
  });
  const emailRows: any[] = await emailResult.json();

  const usernameResult = await client.query({
    query: `SELECT id FROM users FINAL WHERE username = {username: String} LIMIT 1`,
    query_params: { username },
    format: 'JSONEachRow',
  });
  const usernameRows: any[] = await usernameResult.json();

  if (emailRows.length > 0 || usernameRows.length > 0) {
    throw new HttpException(422, {
      errors: {
        ...(emailRows.length > 0 ? { email: ['has already been taken'] } : {}),
        ...(usernameRows.length > 0
          ? { username: ['has already been taken'] }
          : {}),
      },
    });
  }
};

export const createUser = async (
  input: RegisterInput
): Promise<RegisteredUser> => {
  const email = input.email?.trim();
  const username = input.username?.trim();
  const password = input.password?.trim();
  const { image, bio, demo } = input;

  if (!email) {
    throw new HttpException(422, { errors: { email: ["can't be blank"] } });
  }

  if (!username) {
    throw new HttpException(422, { errors: { username: ["can't be blank"] } });
  }

  if (!password) {
    throw new HttpException(422, { errors: { password: ["can't be blank"] } });
  }

  await checkUserUniqueness(email, username);

  const hashedPassword = await bcrypt.hash(password, 10);
  const id = Math.floor(Math.random() * 2147483647);

  await client.insert({
    table: 'users',
    values: [
      {
        id,
        email,
        username,
        password: hashedPassword,
        image: image || null,
        bio: bio || null,
        demo: demo ? 1 : 0,
        version: Date.now(),
      },
    ],
    format: 'JSONEachRow',
  });

  return {
    id,
    email,
    username,
    bio: bio || null,
    image: image || null,
    token: generateToken(id),
  };
};

export const login = async (userPayload: any) => {
  const email = userPayload.email?.trim();
  const password = userPayload.password?.trim();

  if (!email) {
    throw new HttpException(422, { errors: { email: ["can't be blank"] } });
  }

  if (!password) {
    throw new HttpException(422, { errors: { password: ["can't be blank"] } });
  }

  const result = await client.query({
    query: `SELECT id, email, username, password, bio, image FROM users FINAL WHERE email = {email: String} LIMIT 1`,
    query_params: { email },
    format: 'JSONEachRow',
  });
  const rows: any[] = await result.json();

  if (rows.length > 0) {
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (match) {
      return {
        email: user.email,
        username: user.username,
        bio: user.bio,
        image: user.image,
        token: generateToken(Number(user.id)),
      };
    }
  }

  throw new HttpException(403, {
    errors: {
      'email or password': ['is invalid'],
    },
  });
};

export const getCurrentUser = async (id: number) => {
  const result = await client.query({
    query: `SELECT id, email, username, bio, image FROM users FINAL WHERE id = {id: UInt32} LIMIT 1`,
    query_params: { id },
    format: 'JSONEachRow',
  });
  const rows: any[] = await result.json();
  const user = rows[0] as User;

  return {
    ...user,
    id: Number(user.id),
    token: generateToken(Number(user.id)),
  };
};

export const updateUser = async (userPayload: any, id: number) => {
  const { email, username, password, image, bio } = userPayload;

  const currentResult = await client.query({
    query: `SELECT id, email, username, password, bio, image FROM users FINAL WHERE id = {id: UInt32} LIMIT 1`,
    query_params: { id },
    format: 'JSONEachRow',
  });
  const currentRows: any[] = await currentResult.json();

  if (currentRows.length === 0) {
    throw new HttpException(404, {});
  }

  const current = currentRows[0];
  let hashedPassword = current.password;

  if (password) {
    hashedPassword = await bcrypt.hash(password, 10);
  }

  const updatedUser = {
    id,
    email: email || current.email,
    username: username || current.username,
    password: hashedPassword,
    bio: bio !== undefined ? bio : current.bio,
    image: image !== undefined ? image : current.image,
    demo: current.demo,
    version: Date.now(),
  };

  await client.insert({
    table: 'users',
    values: [updatedUser],
    format: 'JSONEachRow',
  });

  return {
    id: updatedUser.id,
    email: updatedUser.email,
    username: updatedUser.username,
    bio: updatedUser.bio,
    image: updatedUser.image,
    token: generateToken(id),
  };
};

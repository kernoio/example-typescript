import * as bcrypt from 'bcryptjs';
import { RegisterInput } from './register-input.model';
import HttpException from '../../models/http-exception.model';
import { RegisteredUser } from './registered-user.model';
import generateToken from './token.utils';
import { User } from './user.model';
import { getTableClient } from '../../azure-clients';

const usersTable = () => getTableClient('users');

const findUserByEmail = async (email: string) => {
  const client = usersTable();
  const results = client.listEntities({ queryOptions: { filter: `email eq '${email}'` } });
  for await (const entity of results) {
    return entity as any;
  }
  return null;
};

const findUserByUsername = async (username: string) => {
  const client = usersTable();
  const results = client.listEntities({ queryOptions: { filter: `username eq '${username}'` } });
  for await (const entity of results) {
    return entity as any;
  }
  return null;
};

const checkUserUniqueness = async (email: string, username: string) => {
  const [existingByEmail, existingByUsername] = await Promise.all([
    findUserByEmail(email),
    findUserByUsername(username),
  ]);

  if (existingByEmail || existingByUsername) {
    throw new HttpException(422, {
      errors: {
        ...(existingByEmail ? { email: ['has already been taken'] } : {}),
        ...(existingByUsername ? { username: ['has already been taken'] } : {}),
      },
    });
  }
};

export const createUser = async (input: RegisterInput): Promise<RegisteredUser> => {
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
  const id = crypto.randomUUID();

  await usersTable().createEntity({
    partitionKey: 'default',
    rowKey: id,
    email,
    username,
    password: hashedPassword,
    ...(image ? { image } : {}),
    ...(bio ? { bio } : {}),
    ...(demo ? { demo } : {}),
  });

  return {
    id,
    email,
    username,
    bio: bio ?? null,
    image: image ?? null,
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

  const user = await findUserByEmail(email);

  if (user) {
    const match = await bcrypt.compare(password, user.password);

    if (match) {
      return {
        email: user.email,
        username: user.username,
        bio: user.bio ?? null,
        image: user.image ?? null,
        token: generateToken(user.rowKey),
      };
    }
  }

  throw new HttpException(403, {
    errors: {
      'email or password': ['is invalid'],
    },
  });
};

export const getCurrentUser = async (id: string): Promise<User & { token: string }> => {
  const entity = await usersTable().getEntity('default', id) as any;

  return {
    id: entity.rowKey,
    email: entity.email,
    username: entity.username,
    bio: entity.bio ?? null,
    image: entity.image ?? null,
    token: generateToken(entity.rowKey),
  };
};

export const updateUser = async (userPayload: any, id: string) => {
  const { email, username, password, image, bio } = userPayload;
  let hashedPassword;

  if (password) {
    hashedPassword = await bcrypt.hash(password, 10);
  }

  const existing = await usersTable().getEntity('default', id) as any;

  await usersTable().updateEntity({
    partitionKey: 'default',
    rowKey: id,
    email: email ?? existing.email,
    username: username ?? existing.username,
    password: hashedPassword ?? existing.password,
    image: image ?? existing.image,
    bio: bio ?? existing.bio,
    demo: existing.demo,
  }, 'Replace');

  return {
    id,
    email: email ?? existing.email,
    username: username ?? existing.username,
    bio: bio ?? existing.bio ?? null,
    image: image ?? existing.image ?? null,
    token: generateToken(id),
  };
};

import slugify from 'slugify';
import { getTableClient } from '../../azure-clients';
import HttpException from '../../models/http-exception.model';

const articlesTable = () => getTableClient('articles');
const commentsTable = () => getTableClient('comments');
const tagsTable = () => getTableClient('tags');
const favoritesTable = () => getTableClient('favorites');
const usersTable = () => getTableClient('users');
const followsTable = () => getTableClient('follows');

const findArticleBySlug = async (slug: string) => {
  const results = articlesTable().listEntities({
    queryOptions: { filter: `slug eq '${slug}'` },
  });
  for await (const entity of results) {
    return entity as any;
  }
  return null;
};

const findUserById = async (userId: string) => {
  try {
    return (await usersTable().getEntity('default', userId)) as any;
  } catch {
    return null;
  }
};

const isFollowing = async (followerId: string, followingId: string): Promise<boolean> => {
  try {
    await followsTable().getEntity(followerId, followingId);
    return true;
  } catch {
    return false;
  }
};

const isFavorited = async (userId: string, articleId: string): Promise<boolean> => {
  try {
    await favoritesTable().getEntity(userId, articleId);
    return true;
  } catch {
    return false;
  }
};

const getFavoritesCount = async (articleId: string): Promise<number> => {
  let count = 0;
  for await (const _ of favoritesTable().listEntities({
    queryOptions: { filter: `RowKey eq '${articleId}'` },
  })) {
    count++;
  }
  return count;
};

const getTagListForArticle = async (articleId: string): Promise<string[]> => {
  const results = tagsTable().listEntities({
    queryOptions: { filter: `PartitionKey eq '${articleId}'` },
  });
  const tags: string[] = [];
  for await (const entity of results) {
    tags.push((entity as any).rowKey);
  }
  return tags;
};

const buildArticleResponse = async (article: any, requestingUserId?: string) => {
  const [author, tagList, favoritesCount, favorited, following] = await Promise.all([
    findUserById(article.authorId),
    getTagListForArticle(article.rowKey),
    getFavoritesCount(article.rowKey),
    requestingUserId ? isFavorited(requestingUserId, article.rowKey) : Promise.resolve(false),
    requestingUserId && article.authorId
      ? isFollowing(requestingUserId, article.authorId)
      : Promise.resolve(false),
  ]);

  return {
    slug: article.slug,
    title: article.title,
    description: article.description,
    body: article.body,
    tagList,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt,
    favorited,
    favoritesCount,
    author: {
      username: author?.username ?? '',
      bio: author?.bio ?? null,
      image: author?.image ?? null,
      following,
    },
  };
};

export const getArticles = async (query: any, id?: string) => {
  const allArticles: any[] = [];
  for await (const entity of articlesTable().listEntities()) {
    allArticles.push(entity);
  }

  let filtered = allArticles;

  if ('author' in query) {
    const authorUser = await (async () => {
      const results = usersTable().listEntities({
        queryOptions: { filter: `username eq '${query.author}'` },
      });
      for await (const e of results) return e as any;
      return null;
    })();
    if (!authorUser) {
      return { articles: [], articlesCount: 0 };
    }
    filtered = filtered.filter((a) => a.authorId === authorUser.rowKey);
  }

  if ('tag' in query) {
    const taggedArticleIds = new Set<string>();
    for await (const entity of tagsTable().listEntities({
      queryOptions: { filter: `RowKey eq '${query.tag}'` },
    })) {
      taggedArticleIds.add((entity as any).partitionKey);
    }
    filtered = filtered.filter((a) => taggedArticleIds.has(a.rowKey));
  }

  if ('favorited' in query) {
    const favUser = await (async () => {
      const results = usersTable().listEntities({
        queryOptions: { filter: `username eq '${query.favorited}'` },
      });
      for await (const e of results) return e as any;
      return null;
    })();
    if (!favUser) {
      return { articles: [], articlesCount: 0 };
    }
    const favIds = new Set<string>();
    for await (const entity of favoritesTable().listEntities({
      queryOptions: { filter: `PartitionKey eq '${favUser.rowKey}'` },
    })) {
      favIds.add((entity as any).rowKey);
    }
    filtered = filtered.filter((a) => favIds.has(a.rowKey));
  }

  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const offset = Number(query.offset) || 0;
  const limit = Number(query.limit) || 10;
  const articlesCount = filtered.length;
  const page = filtered.slice(offset, offset + limit);

  const articles = await Promise.all(page.map((a) => buildArticleResponse(a, id)));

  return { articles, articlesCount };
};

export const getFeed = async (offset: number, limit: number, id: string) => {
  const followingIds = new Set<string>();
  for await (const entity of followsTable().listEntities({
    queryOptions: { filter: `PartitionKey eq '${id}'` },
  })) {
    followingIds.add((entity as any).rowKey);
  }

  const allArticles: any[] = [];
  for await (const entity of articlesTable().listEntities()) {
    if (followingIds.has((entity as any).authorId)) {
      allArticles.push(entity);
    }
  }

  allArticles.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const articlesCount = allArticles.length;
  const page = allArticles.slice(offset || 0, (offset || 0) + (limit || 10));

  const articles = await Promise.all(page.map((a) => buildArticleResponse(a, id)));

  return { articles, articlesCount };
};

export const createArticle = async (article: any, id: string) => {
  const { title, description, body, tagList } = article;
  const tags = Array.isArray(tagList) ? tagList : [];

  if (!title) {
    throw new HttpException(422, { errors: { title: ["can't be blank"] } });
  }

  if (!description) {
    throw new HttpException(422, { errors: { description: ["can't be blank"] } });
  }

  if (!body) {
    throw new HttpException(422, { errors: { body: ["can't be blank"] } });
  }

  const slug = `${slugify(title)}-${id}`;

  const existingWithSlug = await findArticleBySlug(slug);
  if (existingWithSlug) {
    throw new HttpException(422, { errors: { title: ['must be unique'] } });
  }

  const articleId = crypto.randomUUID();
  const now = new Date().toISOString();

  await articlesTable().createEntity({
    partitionKey: 'default',
    rowKey: articleId,
    slug,
    title,
    description,
    body,
    authorId: id,
    createdAt: now,
    updatedAt: now,
  });

  await Promise.all(
    tags.map((tag: string) =>
      tagsTable().createEntity({ partitionKey: articleId, rowKey: tag }).catch(() => {}),
    ),
  );

  return buildArticleResponse({ rowKey: articleId, slug, title, description, body, authorId: id, createdAt: now, updatedAt: now }, id);
};

export const getArticle = async (slug: string, id?: string) => {
  const article = await findArticleBySlug(slug);

  if (!article) {
    throw new HttpException(404, { errors: { article: ['not found'] } });
  }

  return buildArticleResponse(article, id);
};

export const updateArticle = async (article: any, slug: string, id: string) => {
  const existingArticle = await findArticleBySlug(slug);

  if (!existingArticle) {
    throw new HttpException(404, {});
  }

  if (existingArticle.authorId !== id) {
    throw new HttpException(403, { message: 'You are not authorized to update this article' });
  }

  let newSlug = slug;

  if (article.title) {
    newSlug = `${slugify(article.title)}-${id}`;

    if (newSlug !== slug) {
      const existingWithNewSlug = await findArticleBySlug(newSlug);
      if (existingWithNewSlug) {
        throw new HttpException(422, { errors: { title: ['must be unique'] } });
      }
    }
  }

  const updatedAt = new Date().toISOString();

  await articlesTable().updateEntity({
    partitionKey: 'default',
    rowKey: existingArticle.rowKey,
    slug: newSlug,
    title: article.title ?? existingArticle.title,
    description: article.description ?? existingArticle.description,
    body: article.body ?? existingArticle.body,
    authorId: existingArticle.authorId,
    createdAt: existingArticle.createdAt,
    updatedAt,
  }, 'Replace');

  if (Array.isArray(article.tagList)) {
    const existingTags: any[] = [];
    for await (const entity of tagsTable().listEntities({
      queryOptions: { filter: `PartitionKey eq '${existingArticle.rowKey}'` },
    })) {
      existingTags.push(entity);
    }
    await Promise.all(existingTags.map((t) => tagsTable().deleteEntity(t.partitionKey, t.rowKey).catch(() => {})));
    await Promise.all(
      article.tagList.map((tag: string) =>
        tagsTable().createEntity({ partitionKey: existingArticle.rowKey, rowKey: tag }).catch(() => {}),
      ),
    );
  }

  const updated = {
    rowKey: existingArticle.rowKey,
    slug: newSlug,
    title: article.title ?? existingArticle.title,
    description: article.description ?? existingArticle.description,
    body: article.body ?? existingArticle.body,
    authorId: existingArticle.authorId,
    createdAt: existingArticle.createdAt,
    updatedAt,
  };

  return buildArticleResponse(updated, id);
};

export const deleteArticle = async (slug: string, id: string) => {
  const existingArticle = await findArticleBySlug(slug);

  if (!existingArticle) {
    throw new HttpException(404, {});
  }

  if (existingArticle.authorId !== id) {
    throw new HttpException(403, { message: 'You are not authorized to delete this article' });
  }

  const articleId = existingArticle.rowKey;

  const deleteComments = async () => {
    const comments: any[] = [];
    for await (const entity of commentsTable().listEntities({
      queryOptions: { filter: `PartitionKey eq '${articleId}'` },
    })) {
      comments.push(entity);
    }
    await Promise.all(comments.map((c) => commentsTable().deleteEntity(c.partitionKey, c.rowKey).catch(() => {})));
  };

  const deleteTags = async () => {
    const tags: any[] = [];
    for await (const entity of tagsTable().listEntities({
      queryOptions: { filter: `PartitionKey eq '${articleId}'` },
    })) {
      tags.push(entity);
    }
    await Promise.all(tags.map((t) => tagsTable().deleteEntity(t.partitionKey, t.rowKey).catch(() => {})));
  };

  await Promise.all([deleteComments(), deleteTags()]);
  await articlesTable().deleteEntity('default', articleId);
};

export const getCommentsByArticle = async (slug: string, id?: string) => {
  const article = await findArticleBySlug(slug);

  if (!article) {
    return [];
  }

  const comments: any[] = [];
  for await (const entity of commentsTable().listEntities({
    queryOptions: { filter: `PartitionKey eq '${article.rowKey}'` },
  })) {
    comments.push(entity);
  }

  return Promise.all(
    comments.map(async (comment) => {
      const author = await findUserById(comment.authorId);
      const following = id && comment.authorId ? await isFollowing(id, comment.authorId) : false;
      return {
        id: comment.rowKey,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        body: comment.body,
        author: {
          username: author?.username ?? '',
          bio: author?.bio ?? null,
          image: author?.image ?? null,
          following,
        },
      };
    }),
  );
};

export const addComment = async (body: string, slug: string, id: string) => {
  if (!body) {
    throw new HttpException(422, { errors: { body: ["can't be blank"] } });
  }

  const article = await findArticleBySlug(slug);

  if (!article) {
    throw new HttpException(404, { errors: { article: ['not found'] } });
  }

  const commentId = crypto.randomUUID();
  const now = new Date().toISOString();

  await commentsTable().createEntity({
    partitionKey: article.rowKey,
    rowKey: commentId,
    body,
    authorId: id,
    createdAt: now,
    updatedAt: now,
  });

  const author = await findUserById(id);

  return {
    id: commentId,
    createdAt: now,
    updatedAt: now,
    body,
    author: {
      username: author?.username ?? '',
      bio: author?.bio ?? null,
      image: author?.image ?? null,
      following: false,
    },
  };
};

export const deleteComment = async (commentId: string, userId: string) => {
  const allArticles: any[] = [];
  for await (const entity of articlesTable().listEntities()) {
    allArticles.push(entity);
  }

  let found: any = null;
  for (const article of allArticles) {
    try {
      const comment = await commentsTable().getEntity(article.rowKey, commentId) as any;
      found = comment;
      break;
    } catch {
      continue;
    }
  }

  if (!found) {
    throw new HttpException(404, {});
  }

  if (found.authorId !== userId) {
    throw new HttpException(403, { message: 'You are not authorized to delete this comment' });
  }

  await commentsTable().deleteEntity(found.partitionKey, found.rowKey);
};

export const favoriteArticle = async (slugPayload: string, id: string) => {
  const article = await findArticleBySlug(slugPayload);

  if (!article) {
    throw new HttpException(404, { errors: { article: ['not found'] } });
  }

  await favoritesTable().createEntity({ partitionKey: id, rowKey: article.rowKey }).catch(() => {});

  return buildArticleResponse(article, id);
};

export const unfavoriteArticle = async (slugPayload: string, id: string) => {
  const article = await findArticleBySlug(slugPayload);

  if (!article) {
    throw new HttpException(404, { errors: { article: ['not found'] } });
  }

  await favoritesTable().deleteEntity(id, article.rowKey).catch(() => {});

  return buildArticleResponse(article, id);
};

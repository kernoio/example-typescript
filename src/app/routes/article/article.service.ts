import slugify from 'slugify';
import client from '../../clickhouse-client';
import HttpException from '../../models/http-exception.model';

const newId = () => Math.floor(Math.random() * 2147483647);

const getArticleTags = async (articleId: number): Promise<string[]> => {
  const result = await client.query({
    query: `SELECT t.name FROM tags AS t FINAL INNER JOIN article_tags AS atg ON atg.tagId = t.id WHERE atg.articleId = {articleId: UInt32}`,
    query_params: { articleId },
    format: 'JSONEachRow',
  });
  const rows: any[] = await result.json();
  return rows.map((r: any) => r.name);
};

const getArticleFavoritedByIds = async (articleId: number): Promise<number[]> => {
  const result = await client.query({
    query: `SELECT userId FROM favorites WHERE articleId = {articleId: UInt32}`,
    query_params: { articleId },
    format: 'JSONEachRow',
  });
  const rows: any[] = await result.json();
  return rows.map((r: any) => Number(r.userId));
};

const getAuthorFollowedByIds = async (authorId: number): Promise<number[]> => {
  const result = await client.query({
    query: `SELECT followerId FROM follows WHERE followingId = {followingId: UInt32}`,
    query_params: { followingId: authorId },
    format: 'JSONEachRow',
  });
  const rows: any[] = await result.json();
  return rows.map((r: any) => Number(r.followerId));
};

const buildArticleResponse = async (article: any, userId?: number) => {
  const articleId = Number(article.id);
  const authorId = Number(article.authorId);

  const [tagList, favoritedByIds, authorResult] = await Promise.all([
    getArticleTags(articleId),
    getArticleFavoritedByIds(articleId),
    client.query({
      query: `SELECT id, username, bio, image FROM users FINAL WHERE id = {id: UInt32} LIMIT 1`,
      query_params: { id: authorId },
      format: 'JSONEachRow',
    }),
  ]);

  const authorRows: any[] = await authorResult.json();
  const author = authorRows[0];
  const followedByIds = await getAuthorFollowedByIds(authorId);

  return {
    slug: article.slug,
    title: article.title,
    description: article.description,
    body: article.body,
    tagList,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt,
    favorited: userId ? favoritedByIds.includes(userId) : false,
    favoritesCount: favoritedByIds.length,
    author: {
      username: author.username,
      bio: author.bio,
      image: author.image,
      following: userId ? followedByIds.includes(userId) : false,
    },
  };
};

const upsertTag = async (name: string): Promise<number> => {
  const result = await client.query({
    query: `SELECT id FROM tags FINAL WHERE name = {name: String} LIMIT 1`,
    query_params: { name },
    format: 'JSONEachRow',
  });
  const rows: any[] = await result.json();

  if (rows.length > 0) {
    return Number(rows[0].id);
  }

  const id = newId();
  await client.insert({
    table: 'tags',
    values: [{ id, name, version: Date.now() }],
    format: 'JSONEachRow',
  });
  return id;
};

export const getArticles = async (query: any, id?: number) => {
  const offset = Number(query.offset) || 0;
  const limit = Number(query.limit) || 10;

  let whereClause = `WHERE (u.demo = 1${id ? ` OR a.authorId = ${id}` : ''})`;

  if ('author' in query) {
    whereClause += ` AND u.username = {authorUsername: String}`;
  }

  if ('tag' in query) {
    whereClause += ` AND a.id IN (SELECT atg.articleId FROM article_tags AS atg INNER JOIN tags AS t FINAL ON t.id = atg.tagId WHERE t.name = {tag: String})`;
  }

  if ('favorited' in query) {
    whereClause += ` AND a.id IN (SELECT f.articleId FROM favorites AS f INNER JOIN users AS fu FINAL ON fu.id = f.userId WHERE fu.username = {favoritedBy: String})`;
  }

  const queryParams: any = {};
  if ('author' in query) queryParams.authorUsername = query.author;
  if ('tag' in query) queryParams.tag = query.tag;
  if ('favorited' in query) queryParams.favoritedBy = query.favorited;

  const countResult = await client.query({
    query: `SELECT count() AS cnt FROM articles AS a FINAL INNER JOIN users AS u FINAL ON u.id = a.authorId ${whereClause}`,
    query_params: queryParams,
    format: 'JSONEachRow',
  });
  const countRows: any[] = await countResult.json();
  const articlesCount = Number(countRows[0]?.cnt || 0);

  const articlesResult = await client.query({
    query: `SELECT a.* FROM articles AS a FINAL INNER JOIN users AS u FINAL ON u.id = a.authorId ${whereClause} ORDER BY a.createdAt DESC LIMIT ${limit} OFFSET ${offset}`,
    query_params: queryParams,
    format: 'JSONEachRow',
  });
  const articleRows: any[] = await articlesResult.json();

  const articles = await Promise.all(
    articleRows.map((article: any) => buildArticleResponse(article, id))
  );

  return { articles, articlesCount };
};

export const getFeed = async (offset: number, limit: number, id: number) => {
  const countResult = await client.query({
    query: `SELECT count() AS cnt FROM articles AS a FINAL WHERE a.authorId IN (SELECT followingId FROM follows WHERE followerId = {id: UInt32})`,
    query_params: { id },
    format: 'JSONEachRow',
  });
  const countRows: any[] = await countResult.json();
  const articlesCount = Number(countRows[0]?.cnt || 0);

  const articlesResult = await client.query({
    query: `SELECT a.* FROM articles AS a FINAL WHERE a.authorId IN (SELECT followingId FROM follows WHERE followerId = {id: UInt32}) ORDER BY a.createdAt DESC LIMIT ${limit || 10} OFFSET ${offset || 0}`,
    query_params: { id },
    format: 'JSONEachRow',
  });
  const articleRows: any[] = await articlesResult.json();

  const articles = await Promise.all(
    articleRows.map((article: any) => buildArticleResponse(article, id))
  );

  return { articles, articlesCount };
};

export const createArticle = async (article: any, id: number) => {
  const { title, description, body, tagList } = article;
  const tags = Array.isArray(tagList) ? tagList : [];

  if (!title) {
    throw new HttpException(422, { errors: { title: ["can't be blank"] } });
  }

  if (!description) {
    throw new HttpException(422, {
      errors: { description: ["can't be blank"] },
    });
  }

  if (!body) {
    throw new HttpException(422, { errors: { body: ["can't be blank"] } });
  }

  const slug = `${slugify(title)}-${id}`;

  const existingResult = await client.query({
    query: `SELECT slug FROM articles FINAL WHERE slug = {slug: String} LIMIT 1`,
    query_params: { slug },
    format: 'JSONEachRow',
  });
  const existingRows: any[] = await existingResult.json();

  if (existingRows.length > 0) {
    throw new HttpException(422, { errors: { title: ['must be unique'] } });
  }

  const articleId = newId();
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '').split('.')[0];

  await client.insert({
    table: 'articles',
    values: [
      {
        id: articleId,
        slug,
        title,
        description,
        body,
        createdAt: now,
        updatedAt: now,
        authorId: id,
        version: Date.now(),
      },
    ],
    format: 'JSONEachRow',
  });

  for (const tagName of tags) {
    const tagId = await upsertTag(tagName);
    await client.insert({
      table: 'article_tags',
      values: [{ articleId, tagId }],
      format: 'JSONEachRow',
    });
  }

  const articleResult = await client.query({
    query: `SELECT * FROM articles FINAL WHERE id = {id: UInt32} LIMIT 1`,
    query_params: { id: articleId },
    format: 'JSONEachRow',
  });
  const articleRows: any[] = await articleResult.json();

  return buildArticleResponse(articleRows[0], id);
};

export const getArticle = async (slug: string, id?: number) => {
  const result = await client.query({
    query: `SELECT * FROM articles FINAL WHERE slug = {slug: String} LIMIT 1`,
    query_params: { slug },
    format: 'JSONEachRow',
  });
  const rows: any[] = await result.json();

  if (rows.length === 0) {
    throw new HttpException(404, { errors: { article: ['not found'] } });
  }

  return buildArticleResponse(rows[0], id);
};

export const updateArticle = async (article: any, slug: string, id: number) => {
  const existingResult = await client.query({
    query: `SELECT a.id, a.authorId FROM articles AS a FINAL WHERE a.slug = {slug: String} LIMIT 1`,
    query_params: { slug },
    format: 'JSONEachRow',
  });
  const existingRows: any[] = await existingResult.json();

  if (existingRows.length === 0) {
    throw new HttpException(404, {});
  }

  const existing = existingRows[0];
  if (Number(existing.authorId) !== id) {
    throw new HttpException(403, {
      message: 'You are not authorized to update this article',
    });
  }

  const articleId = Number(existing.id);
  let newSlug = slug;

  if (article.title) {
    newSlug = `${slugify(article.title)}-${id}`;

    if (newSlug !== slug) {
      const dupResult = await client.query({
        query: `SELECT slug FROM articles FINAL WHERE slug = {slug: String} LIMIT 1`,
        query_params: { slug: newSlug },
        format: 'JSONEachRow',
      });
      const dupRows: any[] = await dupResult.json();
      if (dupRows.length > 0) {
        throw new HttpException(422, { errors: { title: ['must be unique'] } });
      }
    }
  }

  const currentResult = await client.query({
    query: `SELECT * FROM articles FINAL WHERE id = {id: UInt32} LIMIT 1`,
    query_params: { id: articleId },
    format: 'JSONEachRow',
  });
  const currentRows: any[] = await currentResult.json();
  const current = currentRows[0];

  const now = new Date().toISOString().replace('T', ' ').replace('Z', '').split('.')[0];

  await client.insert({
    table: 'articles',
    values: [
      {
        id: articleId,
        slug: newSlug,
        title: article.title || current.title,
        description: article.description || current.description,
        body: article.body || current.body,
        createdAt: current.createdAt,
        updatedAt: now,
        authorId: id,
        version: Date.now(),
      },
    ],
    format: 'JSONEachRow',
  });

  if (Array.isArray(article.tagList) && article.tagList.length > 0) {
    await client.command({
      query: `DELETE FROM article_tags WHERE articleId = {articleId: UInt32}`,
      query_params: { articleId },
    });

    for (const tagName of article.tagList) {
      const tagId = await upsertTag(tagName);
      await client.insert({
        table: 'article_tags',
        values: [{ articleId, tagId }],
        format: 'JSONEachRow',
      });
    }
  }

  const updatedResult = await client.query({
    query: `SELECT * FROM articles FINAL WHERE id = {id: UInt32} LIMIT 1`,
    query_params: { id: articleId },
    format: 'JSONEachRow',
  });
  const updatedRows: any[] = await updatedResult.json();

  return buildArticleResponse(updatedRows[0], id);
};

export const deleteArticle = async (slug: string, id: number) => {
  const existingResult = await client.query({
    query: `SELECT id, authorId FROM articles FINAL WHERE slug = {slug: String} LIMIT 1`,
    query_params: { slug },
    format: 'JSONEachRow',
  });
  const existingRows: any[] = await existingResult.json();

  if (existingRows.length === 0) {
    throw new HttpException(404, {});
  }

  const existing = existingRows[0];
  if (Number(existing.authorId) !== id) {
    throw new HttpException(403, {
      message: 'You are not authorized to delete this article',
    });
  }

  const articleId = Number(existing.id);

  await client.command({
    query: `DELETE FROM articles WHERE id = {id: UInt32}`,
    query_params: { id: articleId },
  });

  await client.command({
    query: `DELETE FROM article_tags WHERE articleId = {articleId: UInt32}`,
    query_params: { articleId },
  });

  await client.command({
    query: `DELETE FROM comments WHERE articleId = {articleId: UInt32}`,
    query_params: { articleId },
  });
};

export const getCommentsByArticle = async (slug: string, id?: number) => {
  const articleResult = await client.query({
    query: `SELECT id, authorId FROM articles FINAL WHERE slug = {slug: String} LIMIT 1`,
    query_params: { slug },
    format: 'JSONEachRow',
  });
  const articleRows: any[] = await articleResult.json();

  if (articleRows.length === 0) {
    return [];
  }

  const articleId = Number(articleRows[0].id);

  let whereClause = `WHERE c.articleId = {articleId: UInt32} AND (u.demo = 1`;
  if (id) {
    whereClause += ` OR c.authorId = {authorId: UInt32}`;
  }
  whereClause += `)`;

  const queryParams: any = { articleId };
  if (id) queryParams.authorId = id;

  const commentsResult = await client.query({
    query: `SELECT c.id, c.createdAt, c.updatedAt, c.body, c.authorId, u.username, u.bio, u.image
      FROM comments AS c FINAL
      INNER JOIN users AS u FINAL ON u.id = c.authorId
      ${whereClause}`,
    query_params: queryParams,
    format: 'JSONEachRow',
  });
  const commentRows: any[] = await commentsResult.json();

  return Promise.all(
    commentRows.map(async (comment: any) => {
      const authorId = Number(comment.authorId);
      const followsResult = await client.query({
        query: `SELECT followerId FROM follows WHERE followingId = {followingId: UInt32}`,
        query_params: { followingId: authorId },
        format: 'JSONEachRow',
      });
      const followsRows: any[] = await followsResult.json();
      const followedByIds = followsRows.map((r: any) => Number(r.followerId));

      return {
        id: Number(comment.id),
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        body: comment.body,
        author: {
          username: comment.username,
          bio: comment.bio,
          image: comment.image,
          following: id ? followedByIds.includes(id) : false,
        },
      };
    })
  );
};

export const addComment = async (body: string, slug: string, id: number) => {
  if (!body) {
    throw new HttpException(422, { errors: { body: ["can't be blank"] } });
  }

  const articleResult = await client.query({
    query: `SELECT id FROM articles FINAL WHERE slug = {slug: String} LIMIT 1`,
    query_params: { slug },
    format: 'JSONEachRow',
  });
  const articleRows: any[] = await articleResult.json();

  if (articleRows.length === 0) {
    throw new HttpException(404, { errors: { article: ['not found'] } });
  }

  const articleId = Number(articleRows[0].id);
  const commentId = newId();
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '').split('.')[0];

  await client.insert({
    table: 'comments',
    values: [
      {
        id: commentId,
        createdAt: now,
        updatedAt: now,
        body,
        articleId,
        authorId: id,
        version: Date.now(),
      },
    ],
    format: 'JSONEachRow',
  });

  const authorResult = await client.query({
    query: `SELECT username, bio, image FROM users FINAL WHERE id = {id: UInt32} LIMIT 1`,
    query_params: { id },
    format: 'JSONEachRow',
  });
  const authorRows: any[] = await authorResult.json();
  const author = authorRows[0];

  const followsResult = await client.query({
    query: `SELECT followerId FROM follows WHERE followingId = {followingId: UInt32}`,
    query_params: { followingId: id },
    format: 'JSONEachRow',
  });
  const followsRows: any[] = await followsResult.json();
  const followedByIds = followsRows.map((r: any) => Number(r.followerId));

  return {
    id: commentId,
    createdAt: now,
    updatedAt: now,
    body,
    author: {
      username: author.username,
      bio: author.bio,
      image: author.image,
      following: followedByIds.includes(id),
    },
  };
};

export const deleteComment = async (id: number, userId: number) => {
  const result = await client.query({
    query: `SELECT id, authorId FROM comments FINAL WHERE id = {id: UInt32} LIMIT 1`,
    query_params: { id },
    format: 'JSONEachRow',
  });
  const rows: any[] = await result.json();

  if (rows.length === 0) {
    throw new HttpException(404, {});
  }

  const comment = rows[0];
  if (Number(comment.authorId) !== userId) {
    throw new HttpException(403, {
      message: 'You are not authorized to delete this comment',
    });
  }

  await client.command({
    query: `DELETE FROM comments WHERE id = {id: UInt32}`,
    query_params: { id },
  });
};

export const favoriteArticle = async (slugPayload: string, id: number) => {
  const articleResult = await client.query({
    query: `SELECT * FROM articles FINAL WHERE slug = {slug: String} LIMIT 1`,
    query_params: { slug: slugPayload },
    format: 'JSONEachRow',
  });
  const articleRows: any[] = await articleResult.json();

  if (articleRows.length === 0) {
    throw new HttpException(404, { errors: { article: ['not found'] } });
  }

  const article = articleRows[0];
  const articleId = Number(article.id);

  const existingFavResult = await client.query({
    query: `SELECT userId FROM favorites WHERE userId = {userId: UInt32} AND articleId = {articleId: UInt32} LIMIT 1`,
    query_params: { userId: id, articleId },
    format: 'JSONEachRow',
  });
  const existingFavRows: any[] = await existingFavResult.json();

  if (existingFavRows.length === 0) {
    await client.insert({
      table: 'favorites',
      values: [{ userId: id, articleId }],
      format: 'JSONEachRow',
    });
  }

  return buildArticleResponse(article, id);
};

export const unfavoriteArticle = async (slugPayload: string, id: number) => {
  const articleResult = await client.query({
    query: `SELECT * FROM articles FINAL WHERE slug = {slug: String} LIMIT 1`,
    query_params: { slug: slugPayload },
    format: 'JSONEachRow',
  });
  const articleRows: any[] = await articleResult.json();

  if (articleRows.length === 0) {
    throw new HttpException(404, { errors: { article: ['not found'] } });
  }

  const article = articleRows[0];
  const articleId = Number(article.id);

  await client.command({
    query: `DELETE FROM favorites WHERE userId = {userId: UInt32} AND articleId = {articleId: UInt32}`,
    query_params: { userId: id, articleId },
  });

  return buildArticleResponse(article, id);
};

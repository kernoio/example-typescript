import client from '../../clickhouse-client';

const getTags = async (id?: number): Promise<string[]> => {
  const authorFilter = id
    ? `AND (u.demo = 1 OR u.id = ${id})`
    : `AND u.demo = 1`;

  const result = await client.query({
    query: `SELECT t.name, count() AS article_count
      FROM tags AS t FINAL
      INNER JOIN article_tags AS atg ON atg.tagId = t.id
      INNER JOIN articles AS a FINAL ON a.id = atg.articleId
      INNER JOIN users AS u FINAL ON u.id = a.authorId
      WHERE 1=1 ${authorFilter}
      GROUP BY t.name
      ORDER BY article_count DESC
      LIMIT 10`,
    format: 'JSONEachRow',
  });
  const rows: any[] = await result.json();
  return rows.map((row: any) => row.name);
};

export default getTags;

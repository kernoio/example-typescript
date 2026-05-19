import { getTableClient } from '../../azure-clients';

const tagsTable = () => getTableClient('tags');

const getTags = async (): Promise<string[]> => {
  const tagCounts = new Map<string, number>();

  for await (const entity of tagsTable().listEntities()) {
    const tagName = (entity as any).rowKey;
    tagCounts.set(tagName, (tagCounts.get(tagName) ?? 0) + 1);
  }

  return Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name]) => name);
};

export default getTags;

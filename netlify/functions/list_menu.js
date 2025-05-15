import { Client, Environment } from "square";

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production,
  additionalHeaders: { 'Square-Version': '2025-03-19' }
});

export async function handler(event) {
  try {
    const response = await client.catalogApi.listCatalog(undefined, ['ITEM', 'MODIFIER']);
    
    // Transform Square catalog items to match UI expectations
    const transformedItems = response.result.objects
      .filter(item => item.type === 'ITEM')
      .map(item => ({
        id: item.id,
        name: item.itemData.name,
        description: item.itemData.description || '',
        price: item.itemData.variations[0]?.itemVariationData?.priceMoney?.amount || 0,
        currency: item.itemData.variations[0]?.itemVariationData?.priceMoney?.currency || 'USD'
      }));

    return {
      statusCode: 200,
      body: JSON.stringify(transformedItems)
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message || String(err) })
    };
  }
}

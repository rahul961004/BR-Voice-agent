import { Client, Environment } from "square";

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production,
  additionalHeaders: { 'Square-Version': '2025-03-19' }
});

export async function handler(event) {
  // Enable detailed logging
  console.log('List Menu Function Called');
  console.log('Environment Variables:', {
    SQUARE_ACCESS_TOKEN: process.env.SQUARE_ACCESS_TOKEN ? 'Present' : 'Missing',
    SQUARE_LOCATION_ID: process.env.SQUARE_LOCATION_ID ? 'Present' : 'Missing'
  });

  try {
    console.log('Square Client Initialized');

    const response = await client.catalogApi.listCatalog(undefined, ['ITEM', 'MODIFIER']);
    
    console.log('Catalog Response Received:', response.result?.objects?.length, 'items');

    // Transform Square catalog items to match UI expectations
    const transformedItems = (response.result.objects || [])
      .filter(item => item.type === 'ITEM')
      .map(item => {
        console.log('Processing Item:', item.id, item.itemData?.name);
        return {
          id: item.id,
          name: item.itemData.name,
          description: item.itemData.description || '',
          price: item.itemData.variations?.[0]?.itemVariationData?.priceMoney?.amount || 0,
          currency: item.itemData.variations?.[0]?.itemVariationData?.priceMoney?.currency || 'USD'
        };
      });

    console.log('Transformed Items:', transformedItems.length);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET'
      },
      body: JSON.stringify(transformedItems)
    };
  } catch (err) {
    console.error('Error in List Menu Function:', err);
    return {
      statusCode: err.statusCode || 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: err.message || String(err),
        stack: err.stack
      })
    };
  }
}

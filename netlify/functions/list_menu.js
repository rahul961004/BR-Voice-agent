import { Client, Environment } from "square";

export async function handler(event) {
  // Comprehensive logging for production
  console.log('List Menu Function - Initiated', {
    method: event.httpMethod,
    timestamp: new Date().toISOString()
  });

  // CORS Preflight Handling
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: ''
    };
  }

  // Validate HTTP Method
  if (event.httpMethod !== 'GET') {
    console.error('Invalid HTTP Method Attempted:', event.httpMethod);
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  // Validate Access Token
  if (!process.env.SQUARE_ACCESS_TOKEN) {
    console.error('Missing Square Access Token');
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: 'Missing Square Access Token',
        hint: 'Please check Netlify environment variables'
      })
    };
  }

  try {
    // Create Square Client with Production Environment
    const client = new Client({
      accessToken: process.env.SQUARE_ACCESS_TOKEN,
      environment: Environment.Production,
      additionalHeaders: { 'Square-Version': '2025-03-19' }
    });

    // Fetch Catalog Items
    console.log('Fetching Catalog Items from Square');
    const response = await client.catalogApi.listCatalog(undefined, ['ITEM']);
    
    // Transform Catalog Items
    const transformedItems = (response.result.objects || [])
      .filter(item => item.type === 'ITEM')
      .map(item => {
        const variation = item.itemData.variations?.[0]?.itemVariationData;
        return {
          id: item.id,
          name: item.itemData.name || 'Unnamed Item',
          description: item.itemData.description || '',
          price: variation?.priceMoney?.amount || 0,
          currency: variation?.priceMoney?.currency || 'USD'
        };
      });

    console.log(`Transformed ${transformedItems.length} menu items`);

    // Return Response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET'
      },
      body: JSON.stringify(transformedItems)
    };
  } catch (error) {
    // Comprehensive Error Logging
    console.error('Menu Retrieval Error', {
      errorName: error.name,
      errorMessage: error.message,
      errorCode: error.statusCode || 'UNKNOWN'
    });

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: 'Failed to retrieve menu',
        message: error.message
      })
    };
  }
};

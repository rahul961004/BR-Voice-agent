// Use CommonJS require for Netlify compatibility
const { Client } = require('square');

exports.handler = async function(event) {
  // Enhanced logging for comprehensive debugging
  console.log('List Menu Function - Detailed Diagnostics', {
    timestamp: new Date().toISOString(),
    method: event.httpMethod,
    headers: JSON.stringify(event.headers),
    environment: process.env.NODE_ENV
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
      body: JSON.stringify({ 
        error: 'Method Not Allowed',
        details: `Received ${event.httpMethod}, expected GET`
      })
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
        error: 'Missing Square Credentials',
        hint: 'Check Netlify environment variables'
      })
    };
  }

  try {
    // Create Square Client with production environment
    const client = new Client({
      accessToken: process.env.SQUARE_ACCESS_TOKEN,
      environment: 'production'
    });

    // Use the catalog API to list items
    const response = await client.catalogApi.searchCatalogItems({
      enabledLocationIds: process.env.SQUARE_LOCATION_ID ? [process.env.SQUARE_LOCATION_ID] : undefined,
      productTypes: ['REGULAR']
    });

    const items = response.result.items || [];

    if (!items.length) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'No menu items found',
          hint: 'Check Square catalog configuration'
        })
      };
    }

    // Transform items to required format
    const transformedItems = items.map(item => ({
      id: item.id,
      item_data: {
        name: item.itemData?.name || '',
        description: item.itemData?.description || '',
        variations: item.itemData?.variations || [],
        modifier_list_info: item.itemData?.modifierListInfo || []
      }
    }));

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
      errorCode: error.statusCode || 'UNKNOWN',
      errorStack: error.stack,
      squareClientConfig: {
        accessTokenPresent: !!process.env.SQUARE_ACCESS_TOKEN,
        locationIdPresent: !!process.env.SQUARE_LOCATION_ID
      }
    });

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: 'Failed to retrieve menu',
        message: error.message,
        details: 'Check server logs for more information'
      })
    };
  }
};

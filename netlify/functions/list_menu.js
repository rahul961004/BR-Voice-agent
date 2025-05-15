// Use CommonJS require for Netlify compatibility
const { SquareClient, SquareEnvironment } = require('square');

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
    // Correct Square Client initialization
    const client = new SquareClient({
      token: process.env.SQUARE_ACCESS_TOKEN,
      environment: SquareEnvironment.Production,
    });

    // Fetch both ITEM and MODIFIER objects
    const response = await client.catalogApi.listCatalog(undefined, 'ITEM,MODIFIER');
    const objects = response.result.objects || [];

    if (!objects.length) {
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

    // Transform Catalog Items to required format
    const transformedItems = objects
      .filter(obj => obj.type === 'ITEM')
      .map(item => ({
        id: item.id,
        item_data: {
          name: item.itemData?.name || '',
          description: item.itemData?.description || '',
          variations: item.itemData?.variations || [],
          modifier_list_info: item.itemData?.modifierListInfo || []
        }
      }));

    // Optionally, you can also return MODIFIER objects if needed by your agent
    // const modifiers = objects.filter(obj => obj.type === 'MODIFIER');

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

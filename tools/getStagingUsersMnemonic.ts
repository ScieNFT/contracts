const dotenv = require('dotenv');
dotenv.config({ path: './.env' });

const InfisicalClient = require('infisical-node');

/*
 *
 *  PRINT USERS_MNEMONIC TO STDOUT FROM INFISICAL
 *
 *  This is used with execSync when starting the nest RPC service
 */

(async function () {
  const client = new InfisicalClient({
    token: process.env.STAGING_INFISICAL_TOKEN || '',
  });

  try {
    const secret = await client.getSecret('USERS_MNEMONIC', {
      environment: 'stag',
      path: '/',
      type: 'shared',
    });
    const value = secret.secretValue; // get its value
    console.log(value);
  } catch (error) {
    console.error('An error occurred:', error);
  }
})();
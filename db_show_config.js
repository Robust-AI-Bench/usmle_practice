#!/usr/bin/env node

const { getSupabaseClient } = require('./db_utils');

// Show current configuration
async function showConfiguration() {
  try {
    const supabase = getSupabaseClient();
    
    try {
      const { data, error } = await supabase
        .from('configuration')
        .select('*')
        .limit(1)
        .single();
      
      if (error) throw error;
      
      console.log('\nCurrent Configuration:');
      console.log(JSON.stringify(data.question_sets, null, 2));
      
      return data;
    } catch (error) {
      if (error.message && error.message.includes('not found')) {
        console.error('Configuration table not found or empty. Please run db:init first.');
      } else {
        console.error('Error retrieving configuration:', error.message);
      }
      throw error;
    }
  } catch (error) {
    console.error('Error connecting to database:', error.message);
    throw error;
  }
}

// If this script is run directly
if (require.main === module) {
  showConfiguration()
    .then(() => {
      console.log('Configuration display complete.');
      process.exit(0);
    })
    .catch(error => {
      console.error('Failed to display configuration:', error);
      process.exit(1);
    });
}

module.exports = { showConfiguration }; 
#!/usr/bin/env node

const readline = require('readline');
const { getSupabaseClient } = require('./db_utils');
const { showConfiguration } = require('./db_show_config');

// CLI interface
let rl;
function createInterface() {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }
  return rl;
}

// Update configuration
async function updateConfiguration() {
  try {
    const supabase = getSupabaseClient();
    const rl = createInterface();
    
    // First get the current configuration
    const currentConfig = await showConfiguration().catch(error => {
      console.error('Error retrieving current configuration:', error.message);
      throw error;
    });
    
    return new Promise((resolve, reject) => {
      rl.question('\nEnter the new configuration as JSON (press Enter to keep current): ', async (input) => {
        if (!input.trim()) {
          console.log('Configuration unchanged.');
          resolve();
          return;
        }
        
        try {
          const newConfig = JSON.parse(input);
          
          // Validate the configuration
          if (!Array.isArray(newConfig)) {
            throw new Error('Configuration must be an array of question sets');
          }
          
          // Ensure each set has required properties
          for (const set of newConfig) {
            if (!set.name || typeof set.percentage !== 'number') {
              throw new Error('Each question set must have a name and percentage');
            }
          }
          
          // Ensure percentages sum to 100
          const totalPercentage = newConfig.reduce((sum, set) => sum + set.percentage, 0);
          if (Math.abs(totalPercentage - 100) > 0.01) {
            throw new Error(`Percentages must sum to 100, got ${totalPercentage}`);
          }
          
          // Update the configuration
          try {
            const { error: updateError } = await supabase
              .from('configuration')
              .update({ question_sets: newConfig, updated_at: new Date() })
              .eq('id', 1);
            
            if (updateError) throw updateError;
            
            console.log('Configuration updated successfully!');
            
            // Show the new configuration
            await showConfiguration();
            
            resolve();
          } catch (dbError) {
            console.error('Database error:', dbError.message);
            reject(dbError);
          }
        } catch (error) {
          console.error('Error updating configuration:', error.message);
          reject(error);
        }
      });
    });
  } catch (error) {
    console.error('Error preparing to update configuration:', error.message);
    throw error;
  }
}

// If this script is run directly
if (require.main === module) {
  updateConfiguration()
    .then(() => {
      if (rl) rl.close();
      console.log('Update process complete.');
      process.exit(0);
    })
    .catch(error => {
      if (rl) rl.close();
      console.error('Update process failed:', error);
      process.exit(1);
    });
}

module.exports = { updateConfiguration }; 
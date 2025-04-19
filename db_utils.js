const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// Supabase credentials from env
const supabaseUrl = process.env.supabase_server;
const supabaseServiceKey = process.env.supabase_service_key;

// Initialize Supabase client with service role key (admin access)
function getSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: Supabase credentials not found in environment variables.');
    console.error('Make sure you have a .env file with supabase_server and supabase_service_key defined.');
    process.exit(1);
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// Export utility functions and variables
module.exports = {
  getSupabaseClient,
  supabaseUrl,
  supabaseServiceKey
}; 
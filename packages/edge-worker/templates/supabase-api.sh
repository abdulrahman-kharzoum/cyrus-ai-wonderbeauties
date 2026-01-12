#!/bin/bash

# Supabase API Helper Script
# Usage: source supabase-api.sh

# Ensure environment variables are set
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
    echo "Error: SUPABASE_URL and SUPABASE_KEY environment variables must be set."
    echo "Please add them to your .env file or export them in your shell."
    return 1
fi

# Function: GET Request
supabase_get() {
    local endpoint="$1"
    local url="${SUPABASE_URL}${endpoint}"
    
    echo "GET $url"
    curl -s -X GET "$url" \
        -H "Authorization: Bearer $SUPABASE_KEY" \
        -H "apikey: $SUPABASE_KEY" \
        -H "Content-Type: application/json"
    echo "" # Add newline
}

# Function: POST Request
supabase_post() {
    local endpoint="$1"
    local data="$2"
    local url="${SUPABASE_URL}${endpoint}"
    
    echo "POST $url"
    curl -s -X POST "$url" \
        -H "Authorization: Bearer $SUPABASE_KEY" \
        -H "apikey: $SUPABASE_KEY" \
        -H "Content-Type: application/json" \
        -H "Prefer: return=representation" \
        -d "$data"
    echo "" # Add newline
}

# Function: PATCH Request
supabase_patch() {
    local endpoint="$1"
    local data="$2"
    local url="${SUPABASE_URL}${endpoint}"
    
    echo "PATCH $url"
    curl -s -X PATCH "$url" \
        -H "Authorization: Bearer $SUPABASE_KEY" \
        -H "apikey: $SUPABASE_KEY" \
        -H "Content-Type: application/json" \
        -H "Prefer: return=representation" \
        -d "$data"
    echo "" # Add newline
}

# Function: DELETE Request
supabase_delete() {
    local endpoint="$1"
    local url="${SUPABASE_URL}${endpoint}"
    
    echo "DELETE $url"
    curl -s -X DELETE "$url" \
        -H "Authorization: Bearer $SUPABASE_KEY" \
        -H "apikey: $SUPABASE_KEY" \
        -H "Content-Type: application/json" \
        -H "Prefer: return=representation"
    echo "" # Add newline
}

echo "Supabase helper loaded."
echo "Functions available: supabase_get, supabase_post, supabase_patch, supabase_delete"

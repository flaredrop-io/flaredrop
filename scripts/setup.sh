#!/bin/bash
set -e

echo "FlareDrop Setup"
echo "==============="
echo ""

# Clear any API token to use OAuth
unset CLOUDFLARE_API_TOKEN

echo "Logging in to Cloudflare..."
npx -y wrangler@latest login
echo ""

echo "Creating D1 database..."
D1_OUTPUT=$(npx -y wrangler@latest d1 create flaredrop-db 2>&1) || {
    if echo "$D1_OUTPUT" | grep -q "already exists"; then
        echo "D1 database 'flaredrop-db' already exists, fetching info..."
        D1_OUTPUT=$(npx -y wrangler@latest d1 info flaredrop-db 2>&1)
    else
        echo "Error creating D1 database:"
        echo "$D1_OUTPUT"
        exit 1
    fi
}

# Extract database_id from output
D1_ID=$(echo "$D1_OUTPUT" | grep -oP '(?<=database_id = "|uuid: )[a-f0-9-]+' | head -1)
if [ -z "$D1_ID" ]; then
    D1_ID=$(echo "$D1_OUTPUT" | grep -oP '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' | head -1)
fi

if [ -z "$D1_ID" ]; then
    echo "Could not extract D1 database ID from output:"
    echo "$D1_OUTPUT"
    exit 1
fi
echo "D1 database ID: $D1_ID"

echo ""
echo "Creating KV namespace..."
KV_OUTPUT=$(npx -y wrangler@latest kv:namespace create FILES 2>&1) || {
    if echo "$KV_OUTPUT" | grep -q "already exists"; then
        echo "KV namespace 'FILES' already exists, fetching info..."
        KV_OUTPUT=$(npx -y wrangler@latest kv:namespace list 2>&1)
        KV_ID=$(echo "$KV_OUTPUT" | grep -oP '"id":\s*"[^"]+flaredrop[^"]*"' | grep -oP '[a-f0-9]{32}' | head -1)
        if [ -z "$KV_ID" ]; then
            KV_ID=$(echo "$KV_OUTPUT" | grep -B2 -A2 "FILES" | grep -oP '[a-f0-9]{32}' | head -1)
        fi
    else
        echo "Error creating KV namespace:"
        echo "$KV_OUTPUT"
        exit 1
    fi
}

# Extract KV id from output if not already set
if [ -z "$KV_ID" ]; then
    KV_ID=$(echo "$KV_OUTPUT" | grep -oP '(?<=id = "|"id":\s*")[a-f0-9]+' | head -1)
fi
if [ -z "$KV_ID" ]; then
    KV_ID=$(echo "$KV_OUTPUT" | grep -oP '[a-f0-9]{32}' | head -1)
fi

if [ -z "$KV_ID" ]; then
    echo "Could not extract KV namespace ID from output:"
    echo "$KV_OUTPUT"
    exit 1
fi
echo "KV namespace ID: $KV_ID"

echo ""
echo "Updating wrangler.toml..."

# Update wrangler.toml with the IDs
sed -i "s/database_id = \"local\"/database_id = \"$D1_ID\"/" wrangler.toml
sed -i "s/id = \"files-kv\"/id = \"$KV_ID\"/" wrangler.toml

# Prompt for authorized email
echo ""
read -p "Enter your authorized email address: " AUTH_EMAIL
if [ -n "$AUTH_EMAIL" ]; then
    sed -i "s/# AUTHORIZED_EMAIL = \"your-email@example.com\"/AUTHORIZED_EMAIL = \"$AUTH_EMAIL\"/" wrangler.toml
fi

echo ""
echo "Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Review wrangler.toml to verify the configuration"
echo "  2. Deploy with: npm run deploy"
echo "  3. Configure Email Routing in Cloudflare Dashboard"
echo ""

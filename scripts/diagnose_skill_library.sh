#!/bin/bash

echo "=== WORKER SKILL LIBRARY DIAGNOSTIC ==="
echo ""

echo "1. Checking embeddings file..."
if [ -f "data/embeddings/embeddings.json" ]; then
    SIZE=$(du -h data/embeddings/embeddings.json | cut -f1)
    LINES=$(wc -l < data/embeddings/embeddings.json)
    echo "   ✅ File exists: $SIZE ($LINES lines)"
    
    # Check if it's valid JSON
    if head -c 100 data/embeddings/embeddings.json | grep -q '"timestamp"'; then
        echo "   ✅ File appears to be valid JSON"
    else
        echo "   ❌ File might be corrupted (no timestamp found)"
    fi
else
    echo "   ❌ File NOT FOUND at: data/embeddings/embeddings.json"
    echo "      Run: node scripts/generate-embeddings.js"
fi

echo ""
echo "2. Checking file permissions..."
if [ -r "data/embeddings/embeddings.json" ]; then
    echo "   ✅ File is readable"
else
    echo "   ❌ File is NOT readable - permission issue"
fi

echo ""
echo "3. Checking embedding_cache.js..."
if grep -q "loadEmbeddings" src/utils/embedding_cache.js; then
    echo "   ✅ embedding_cache.js has loadEmbeddings()"
else
    echo "   ❌ embedding_cache.js missing loadEmbeddings()"
fi

echo ""
echo "4. Checking skill library initialization in prompter..."
if grep -q "initSkillLibrary" src/models/prompter.js; then
    echo "   ✅ prompter.js calls initSkillLibrary()"
    
    # Check if it's in initExamples (async)
    if grep -A 20 "initExamples" src/models/prompter.js | grep -q "initSkillLibrary"; then
        echo "   ✅ initSkillLibrary is called from initExamples()"
    else
        echo "   ❌ initSkillLibrary NOT called from initExamples()"
    fi
else
    echo "   ❌ prompter.js does NOT call initSkillLibrary()"
fi

echo ""
echo "5. Checking if agent.start() calls prompter.initExamples()..."
if grep -A 50 "async start" src/agent/agent.js | grep -q "initExamples"; then
    echo "   ✅ agent.start() calls initExamples()"
else
    echo "   ❌ agent.start() does NOT call initExamples()"
fi

echo ""
echo "6. Checking worker initialization..."
if grep -q "agent.start" src/process/init_worker.js; then
    echo "   ✅ init_worker.js calls agent.start()"
    
    if grep -A 5 "agent.start" src/process/init_worker.js | grep -q "await"; then
        echo "   ✅ init_worker.js WAITS for agent.start() to complete"
    else
        echo "   ⚠️  init_worker.js might NOT wait for agent.start()"
    fi
else
    echo "   ❌ init_worker.js does NOT call agent.start()"
fi

echo ""
echo "=== SUMMARY ==="
echo "If all checks pass, the issue might be:"
echo "1. Working directory mismatch (worker runs from different dir)"
echo "2. Race condition in skill library initialization"
echo "3. Profile not loading correctly for workers"
echo ""
echo "Run with: bash <script.sh)"

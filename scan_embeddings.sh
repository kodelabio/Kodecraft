#!/bin/bash

echo "=== COMPREHENSIVE EMBEDDING & SKILL LIBRARY SCAN ==="
echo ""

echo "1. WHERE IS getSkillEmbeddings IMPORTED?"
grep -r "getSkillEmbeddings" . --include="*.js" 2>/dev/null | grep -v node_modules | grep -v ".npm-global"
echo "   Result: $([ $? -eq 0 ] && echo 'FOUND' || echo 'NOT FOUND')"

echo ""
echo "2. WHERE IS embedding_cache IMPORTED?"
grep -r "embedding_cache" . --include="*.js" 2>/dev/null | grep -v node_modules | grep -v ".npm-global"
echo "   Result: $([ $? -eq 0 ] && echo 'FOUND' || echo 'NOT FOUND')"

echo ""
echo "3. WHERE IS loadEmbeddings CALLED?"
grep -r "loadEmbeddings" . --include="*.js" 2>/dev/null | grep -v node_modules | grep -v ".npm-global"
echo "   Result: $([ $? -eq 0 ] && echo 'FOUND' || echo 'NOT FOUND')"

echo ""
echo "4. WHERE IS getSkillDocs CALLED?"
grep -r "getSkillDocs" . --include="*.js" 2>/dev/null | grep -v node_modules | grep -v ".npm-global"
echo "   Result: $([ $? -eq 0 ] && echo 'FOUND' || echo 'NOT FOUND')"

echo ""
echo "5. WHERE IS initSkillLibrary CALLED?"
grep -r "initSkillLibrary" . --include="*.js" 2>/dev/null | grep -v node_modules | grep -v ".npm-global"
echo "   Result: $([ $? -eq 0 ] && echo 'FOUND' || echo 'NOT FOUND')"

echo ""
echo "6. LIST ALL FILES IN src/agent/library/"
ls -la src/agent/library/ 2>/dev/null || echo "   Directory not found"

echo ""
echo "7. LIST ALL FILES IN src/models/"
ls -la src/models/ 2>/dev/null || echo "   Directory not found"

echo ""
echo "8. LIST ALL FILES IN src/utils/"
ls -la src/utils/ 2>/dev/null || echo "   Directory not found"

echo ""
echo "=== SUMMARY ==="
echo "If getSkillEmbeddings/loadEmbeddings are NOT imported anywhere,"
echo "then embedding_cache.js is NOT being used at all!"
echo ""
echo "The issue: When you switched from dynamic embedding generation"
echo "to loading from file, those changes may not have been integrated"
echo "into the actual skill_library.js initialization."

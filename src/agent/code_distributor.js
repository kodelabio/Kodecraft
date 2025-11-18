
// Distributes leader-generated code to workers with coordinate filtering

export function distributeCode(masterCode, workerCount, buildArea, workerPrefix = 'Worker') {
    console.log(`Distributing code to ${workerCount} workers`);
    console.log(`Build area:`, buildArea);
    
    // Calculate coordinate division (X-axis slicing)
    const totalWidth = buildArea.maxX - buildArea.minX + 1;
    const sliceWidth = Math.floor(totalWidth / workerCount);
    
    const workerAssignments = {};
    
    for (let i = 0; i < workerCount; i++) {
        const workerName = `${workerPrefix}${i + 1}`;
        const startX = buildArea.minX + i * sliceWidth;
        const endX = i === workerCount - 1 
            ? buildArea.maxX  // Last worker gets remainder
            : startX + sliceWidth - 1;
        
        const bounds = {
            minX: startX,
            maxX: endX,
            minY: buildArea.minY,
            maxY: buildArea.maxY,
            minZ: buildArea.minZ,
            maxZ: buildArea.maxZ
        };
        
        // Wrap master code with coordinate filtering
        const workerCode = wrapCodeWithFilter(masterCode, bounds);
        
        workerAssignments[workerName] = {
            code: workerCode,
            bounds: bounds
        };
        
        console.log(`${workerName}: X(${startX}-${endX}), ${endX - startX + 1} blocks wide`);
    }
    
    // Convert to array format for easier iteration
    const workersArray = Object.entries(workerAssignments).map(([workerId, assignment]) => ({
        workerId,
        code: assignment.code,
        bounds: assignment.bounds
    }));
    
    return {
        workers: workersArray,
        strategy: 'x-axis',
        buildArea: buildArea
    };
}


  // Wraps code with placeBlock filtering to respect coordinate boundaries

function wrapCodeWithFilter(masterCode, bounds) {
    // Clean the master code (remove markdown code fences if present)
    let cleanCode = masterCode.trim();
    
    // Remove code block markers if present
    if (cleanCode.startsWith('```')) {
        const firstNewline = cleanCode.indexOf('\n');
        if (firstNewline !== -1) {
            cleanCode = cleanCode.substring(firstNewline + 1);
        }
        const lastBackticks = cleanCode.lastIndexOf('```');
        if (lastBackticks !== -1) {
            cleanCode = cleanCode.substring(0, lastBackticks);
        }
        cleanCode = cleanCode.trim();
    }
    
    // Remove leading "javascript" or "js" language identifier
    const langIdentifiers = ['javascript', 'js'];
    for (const lang of langIdentifiers) {
        if (cleanCode.toLowerCase().startsWith(lang)) {
            cleanCode = cleanCode.substring(lang.length).trim();
        }
    }
    
    // Wrap code in async function to allow await statements
    // Filtering is now handled at compartment level in handleExecuteCode
    const wrappedCode = `
(async function(bot) {
// ═══════════════════════════════════════════════════════════════
// WORKER BUILD TASK
// This worker is responsible for placing blocks in this region:
// X: ${bounds.minX} to ${bounds.maxX} (width: ${bounds.maxX - bounds.minX + 1})
// Y: ${bounds.minY} to ${bounds.maxY} (height: ${bounds.maxY - bounds.minY + 1})
// Z: ${bounds.minZ} to ${bounds.maxZ} (depth: ${bounds.maxZ - bounds.minZ + 1})
// Coordinate filtering is applied automatically by the execution environment.
// ═══════════════════════════════════════════════════════════════

${cleanCode}

})`.trim();
    
    return wrappedCode;
}


 // Alternative: Divide code by Z-axis instead of X-axis

export function distributeCodeByZ(masterCode, workerCount, buildArea, workerPrefix = 'Worker') {
    console.log(`[CodeDistributor] Distributing code by Z-axis to ${workerCount} workers`);
    
    const totalDepth = buildArea.maxZ - buildArea.minZ + 1;
    const sliceDepth = Math.floor(totalDepth / workerCount);
    
    const workerAssignments = {};
    
    for (let i = 0; i < workerCount; i++) {
        const workerName = `${workerPrefix}${i + 1}`;
        const startZ = buildArea.minZ + i * sliceDepth;
        const endZ = i === workerCount - 1 
            ? buildArea.maxZ
            : startZ + sliceDepth - 1;
        
        const bounds = {
            minX: buildArea.minX,
            maxX: buildArea.maxX,
            minY: buildArea.minY,
            maxY: buildArea.maxY,
            minZ: startZ,
            maxZ: endZ
        };
        
        workerAssignments[workerName] = {
            code: wrapCodeWithFilter(masterCode, bounds),
            bounds: bounds
        };
        
        console.log(`${workerName}: Z(${startZ}-${endZ}), ${endZ - startZ + 1} blocks deep`);
    }
    
    // Convert to array format for easier iteration
    const workersArray = Object.entries(workerAssignments).map(([workerId, assignment]) => ({
        workerId,
        code: assignment.code,
        bounds: assignment.bounds
    }));
    
    return {
        workers: workersArray,
        strategy: 'z-axis',
        buildArea: buildArea
    };
}

 // Automatically choose best division strategy based on build area dimensions

export function distributeCodeAuto(masterCode, workerCount, buildArea, workerPrefix = 'Worker') {
    const width = buildArea.maxX - buildArea.minX + 1;
    const depth = buildArea.maxZ - buildArea.minZ + 1;
    
    // Choose division axis based on which dimension is larger
    if (width >= depth) {
        console.log(`Auto-selecting X-axis division (width=${width}, depth=${depth})`);
        return distributeCode(masterCode, workerCount, buildArea, workerPrefix);
    } else {
        console.log(`Auto-selecting Z-axis division (width=${width}, depth=${depth})`);
        return distributeCodeByZ(masterCode, workerCount, buildArea, workerPrefix);
    }
}

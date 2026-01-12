import { runPuzzleSeriesTests } from './PuzzleSeries.test';
import { runSeriesFactoryTests } from './SeriesFactory.test';
import { runSeriesLoadersTests } from './SeriesLoaders.test';

/**
 * Comprehensive test runner for all puzzle series components
 */
export async function runAllSeriesTests(): Promise<boolean> {
    console.log('🚀 Running comprehensive puzzle series tests...\n');

    const results: Array<{ name: string; success: boolean }> = [];

    // Run PuzzleSeries tests
    console.log('='.repeat(50));
    console.log('TESTING: Core PuzzleSeries Logic');
    console.log('='.repeat(50));
    const puzzleSeriesResult = runPuzzleSeriesTests();
    results.push({ name: 'PuzzleSeries', success: puzzleSeriesResult });

    console.log('\n' + '='.repeat(50));
    console.log('TESTING: SeriesFactory and JSON Loading');
    console.log('='.repeat(50));
    const factoryResult = await runSeriesFactoryTests();
    results.push({ name: 'SeriesFactory', success: factoryResult });

    console.log('\n' + '='.repeat(50));
    console.log('TESTING: Progress Storage Systems');
    console.log('='.repeat(50));
    const loadersResult = await runSeriesLoadersTests();
    results.push({ name: 'SeriesLoaders', success: loadersResult });

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS SUMMARY');
    console.log('='.repeat(60));

    let totalPassed = 0;
    let totalTests = results.length;

    results.forEach(result => {
        const status = result.success ? '✓ PASSED' : '❌ FAILED';
        console.log(`${result.name.padEnd(20)} ${status}`);
        if (result.success) totalPassed++;
    });

    console.log('='.repeat(60));
    console.log(`Total: ${totalPassed}/${totalTests} test suites passed`);

    if (totalPassed === totalTests) {
        console.log('🎉 All puzzle series tests completed successfully!');
        console.log('✨ The puzzle series architecture is ready for integration.');
        return true;
    } else {
        console.log('❌ Some tests failed. Please check the output above.');
        return false;
    }
}

// Auto-run tests if this module is executed directly
if (typeof window === 'undefined') {
    runAllSeriesTests().then(success => {
        process.exit(success ? 0 : 1);
    });
}
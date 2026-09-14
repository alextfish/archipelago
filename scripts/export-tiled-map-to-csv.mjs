import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parseStringPromise } from 'xml2js';

function parseArgs(argv) {
    const args = {
        inputPath: 'resources/overworld.json',
        outputPath: null,
        includeSource: false,
        includeHidden: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];

        if (arg === '--output' || arg === '-o') {
            args.outputPath = argv[index + 1] ?? null;
            index += 1;
            continue;
        }

        if (arg === '--source') {
            args.includeSource = true;
            continue;
        }

        if (arg === '--include-hidden') {
            args.includeHidden = true;
            continue;
        }

        if (arg === '--help' || arg === '-h') {
            printUsage();
            process.exit(0);
        }

        if (!arg.startsWith('-')) {
            args.inputPath = arg;
            continue;
        }

        throw new Error(`Unknown argument: ${arg}`);
    }

    return args;
}

function printUsage() {
    console.log([
        'Usage: node scripts/export-tiled-map-to-csv.mjs [input-map] [--output output.csv] [--source] [--include-hidden]',
        '',
        'Examples:',
        '  node scripts/export-tiled-map-to-csv.mjs',
        '  node scripts/export-tiled-map-to-csv.mjs resources/overworld.tmx --output temp/overworld-flat.csv',
        '  node scripts/export-tiled-map-to-csv.mjs resources/overworld.json --source'
    ].join('\n'));
}

function parseInteger(value, fallback = 0) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parseVisible(value, fallback = true) {
    if (value === undefined || value === null) {
        return fallback;
    }

    return value !== false && value !== 0 && value !== '0' && value !== 'false';
}

function parseCsvTileData(dataNode) {
    if (!dataNode) {
        return [];
    }

    const encoding = dataNode.$?.encoding;
    if (encoding && encoding !== 'csv') {
        throw new Error(`Only CSV-encoded TMX layers are supported, found: ${encoding}`);
    }

    const rawData = typeof dataNode === 'string' ? dataNode : (dataNode._ ?? '');

    return rawData
        .split(/[\s,]+/)
        .map((token) => Number.parseInt(token, 10))
        .filter((value) => Number.isFinite(value));
}

function parseTmxTileLayer(layerNode) {
    const attrs = layerNode.$ ?? {};

    return {
        type: 'tilelayer',
        name: attrs.name ?? 'unnamed',
        visible: parseVisible(attrs.visible, true),
        width: parseInteger(attrs.width),
        height: parseInteger(attrs.height),
        x: parseInteger(attrs.x, 0),
        y: parseInteger(attrs.y, 0),
        data: parseCsvTileData(layerNode.data?.[0])
    };
}

function parseTmxGroup(groupNode) {
    const attrs = groupNode.$ ?? {};

    return {
        type: 'group',
        name: attrs.name ?? 'group',
        visible: parseVisible(attrs.visible, true),
        layers: parseTmxLayers(groupNode)
    };
}

function parseTmxLayers(parentNode) {
    const layers = [];

    if (Array.isArray(parentNode.$$)) {
        for (const childNode of parentNode.$$) {
            if (childNode['#name'] === 'layer') {
                layers.push(parseTmxTileLayer(childNode));
                continue;
            }

            if (childNode['#name'] === 'group') {
                layers.push(parseTmxGroup(childNode));
            }
        }

        return layers;
    }

    for (const layerNode of parentNode.layer ?? []) {
        layers.push(parseTmxTileLayer(layerNode));
    }

    for (const groupNode of parentNode.group ?? []) {
        layers.push(parseTmxGroup(groupNode));
    }

    return layers;
}

async function loadMap(mapPath) {
    const fileContent = await fs.readFile(mapPath, 'utf8');

    if (mapPath.endsWith('.json')) {
        return JSON.parse(fileContent);
    }

    if (mapPath.endsWith('.tmx')) {
        const parsedXml = await parseStringPromise(fileContent, {
            explicitChildren: true,
            preserveChildrenOrder: true
        });
        const mapNode = parsedXml.map;
        const mapAttrs = mapNode.$ ?? {};

        return {
            width: parseInteger(mapAttrs.width),
            height: parseInteger(mapAttrs.height),
            layers: parseTmxLayers(mapNode)
        };
    }

    throw new Error(`Unsupported map file: ${mapPath}`);
}

function flattenVisibleTileLayers(mapData, includeHidden) {
    const mapWidth = parseInteger(mapData.width);
    const mapHeight = parseInteger(mapData.height);
    const cellCount = mapWidth * mapHeight;
    const flattenedGIDs = new Array(cellCount).fill(0);
    const flattenedSources = new Array(cellCount).fill('');

    const visitLayers = (layers, parentPath = '', parentVisible = true) => {
        for (const layer of layers ?? []) {
            const layerName = layer.name ?? 'unnamed';
            const fullPath = parentPath ? `${parentPath}/${layerName}` : layerName;
            const isVisible = includeHidden ? true : (parentVisible && parseVisible(layer.visible, true));

            if (!isVisible) {
                continue;
            }

            if (layer.type === 'group') {
                visitLayers(layer.layers, fullPath, isVisible);
                continue;
            }

            if (layer.type !== 'tilelayer' || !Array.isArray(layer.data)) {
                continue;
            }

            const layerWidth = parseInteger(layer.width, mapWidth);
            const layerHeight = parseInteger(layer.height, mapHeight);
            const offsetX = parseInteger(layer.x, 0);
            const offsetY = parseInteger(layer.y, 0);

            for (let localY = 0; localY < layerHeight; localY += 1) {
                for (let localX = 0; localX < layerWidth; localX += 1) {
                    const localIndex = (localY * layerWidth) + localX;
                    const gid = Number(layer.data[localIndex] ?? 0);

                    if (!gid) {
                        continue;
                    }

                    const worldX = localX + offsetX;
                    const worldY = localY + offsetY;

                    if (worldX < 0 || worldX >= mapWidth || worldY < 0 || worldY >= mapHeight) {
                        continue;
                    }

                    const worldIndex = (worldY * mapWidth) + worldX;
                    flattenedGIDs[worldIndex] = gid;
                    flattenedSources[worldIndex] = fullPath;
                }
            }
        }
    };

    visitLayers(mapData.layers);

    return { mapWidth, mapHeight, flattenedGIDs, flattenedSources };
}

function toCsvGrid(values, width, height, formatter = (value) => String(value)) {
    const rows = [];

    for (let y = 0; y < height; y += 1) {
        const row = [];
        for (let x = 0; x < width; x += 1) {
            row.push(formatter(values[(y * width) + x]));
        }
        rows.push(row.join(','));
    }

    return `${rows.join('\n')}\n`;
}

function escapeCsv(value) {
    const text = String(value ?? '');

    if (!/[",\n]/.test(text)) {
        return text;
    }

    return `"${text.replaceAll('"', '""')}"`;
}

function getOutputPaths(inputPath, outputPath, includeSource) {
    const resolvedInput = path.resolve(inputPath);
    const parsedPath = path.parse(outputPath ? path.resolve(outputPath) : resolvedInput);
    const baseName = outputPath ? parsedPath.name : `${parsedPath.name}-flat`;
    const directory = parsedPath.dir;
    const gidOutputPath = outputPath
        ? path.join(directory, `${baseName}${parsedPath.ext || '.csv'}`)
        : path.join(directory, `${baseName}.csv`);
    const sourceOutputPath = includeSource
        ? path.join(directory, `${baseName}-source.csv`)
        : null;

    return { gidOutputPath, sourceOutputPath };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const mapPath = path.resolve(args.inputPath);
    const mapData = await loadMap(mapPath);

    if (!Array.isArray(mapData.layers) || !mapData.width || !mapData.height) {
        throw new Error(`Map is missing width, height, or layers: ${mapPath}`);
    }

    const { mapWidth, mapHeight, flattenedGIDs, flattenedSources } = flattenVisibleTileLayers(mapData, args.includeHidden);
    const { gidOutputPath, sourceOutputPath } = getOutputPaths(mapPath, args.outputPath, args.includeSource);

    await fs.mkdir(path.dirname(gidOutputPath), { recursive: true });
    await fs.writeFile(gidOutputPath, toCsvGrid(flattenedGIDs, mapWidth, mapHeight), 'utf8');

    if (sourceOutputPath) {
        await fs.writeFile(
            sourceOutputPath,
            toCsvGrid(flattenedSources, mapWidth, mapHeight, escapeCsv),
            'utf8'
        );
    }

    console.log(`Flattened ${path.basename(mapPath)} to ${gidOutputPath}`);
    console.log(`Map size: ${mapWidth} x ${mapHeight}`);

    if (sourceOutputPath) {
        console.log(`Layer source CSV: ${sourceOutputPath}`);
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
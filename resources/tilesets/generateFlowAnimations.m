% generateFlowAnimations.m
% Creates composite water flow animations for all valid combinations of
% inflow and outflow directions by rotating/flipping two base animations.
% Compositing uses max (brightest pixel wins / lighten blend mode).

outputDir = fullfile(fileparts(mfilename('fullpath')), 'flow');
if ~exist(outputDir, 'dir')
    mkdir(outputDir);
end

%% Load base images and extract 32x32 frames
straightImg = imread(fullfile(fileparts(mfilename('fullpath')), 'flow_s-to-n.png'));
turnImg = imread(fullfile(fileparts(mfilename('fullpath')), 'flow_s-to-w.png'));

frameSize = 32;
numFrames = 6;

% Extract frames from S-to-N (96x64 = 3 cols x 2 rows)
straightFrames = extractFrames(straightImg, frameSize, 3, 2);

% Extract frames from S-to-W (64x96 = 2 cols x 3 rows)
turnFrames = extractFrames(turnImg, frameSize, 2, 3);

%% Define transformations for each (inflow, outflow) pair
% Directions: N=1, S=2, E=3, W=4
dirs = {'N', 'S', 'E', 'W'};
numDirs = 4;

% Build a lookup table: flowFrames{inDir, outDir} = 6 transformed frames
% Based on rotating/flipping the base straight and turn images.
%
% Straight (S->N) rotated clockwise by k*90:
%   k=0: S->N, k=1: W->E, k=2: N->S, k=3: E->W
%
% Turn (S->W) rotated clockwise by k*90:
%   k=0: S->W, k=1: W->N, k=2: N->E, k=3: E->S
%
% Turn flipped LR (S->E) rotated clockwise by k*90:
%   k=0: S->E, k=1: W->S, k=2: N->W, k=3: E->N

flowFrames = cell(numDirs, numDirs);

% Straight paths
flowFrames{2,1} = transformFrames(straightFrames, 0, false); % S->N
flowFrames{4,3} = transformFrames(straightFrames, 1, false); % W->E
flowFrames{1,2} = transformFrames(straightFrames, 2, false); % N->S
flowFrames{3,4} = transformFrames(straightFrames, 3, false); % E->W

% Left turns (base turn S->W)
flowFrames{2,4} = transformFrames(turnFrames, 0, false); % S->W
flowFrames{4,1} = transformFrames(turnFrames, 1, false); % W->N
flowFrames{1,3} = transformFrames(turnFrames, 2, false); % N->E
flowFrames{3,2} = transformFrames(turnFrames, 3, false); % E->S

% Right turns (flipped turn S->E)
flowFrames{2,3} = transformFrames(turnFrames, 0, true);  % S->E
flowFrames{4,2} = transformFrames(turnFrames, 1, true);  % W->S
flowFrames{1,4} = transformFrames(turnFrames, 2, true);  % N->W
flowFrames{3,1} = transformFrames(turnFrames, 3, true);  % E->N

%% Generate all valid inflow/outflow combinations
% At least one inflow, at least one outflow, no direction in both sets.
allSubsets = getNonemptySubsets(numDirs);
count = 0;

for iIdx = 1:size(allSubsets, 1)
    inflows = allSubsets{iIdx};
    remaining = setdiff(1:numDirs, inflows);
    if isempty(remaining)
        continue;
    end
    outSubsets = getNonemptySubsets(numel(remaining));
    for oIdx = 1:size(outSubsets, 1)
        outflows = remaining(outSubsets{oIdx});

        % Composite all (inflow, outflow) pair animations using max
        composite = zeros(frameSize, frameSize, size(straightImg, 3), numFrames, 'uint8');
        for inDir = inflows
            for outDir = outflows
                frames = flowFrames{inDir, outDir};
                for f = 1:numFrames
                    composite(:,:,:,f) = max(composite(:,:,:,f), frames{f});
                end
            end
        end

        % Save as horizontal strip (192 x 32)
        strip = uint8(zeros(frameSize, frameSize * numFrames, size(straightImg, 3)));
        for f = 1:numFrames
            cols = (f-1)*frameSize + (1:frameSize);
            strip(:, cols, :) = composite(:,:,:,f);
        end

        inLabel = strjoin(dirs(inflows), '');
        outLabel = strjoin(dirs(outflows), '');
        filename = sprintf('flow_%s-to-%s.png', inLabel, outLabel);
        imwrite(strip, fullfile(outputDir, filename));
        count = count + 1;
    end
end

fprintf('Generated %d flow animation images in:\n  %s\n', count, outputDir);

%% Helper functions

function frames = extractFrames(img, frameSize, numCols, numRows)
    % Extract frames from a sprite sheet, reading left-to-right, top-to-bottom.
    frames = cell(1, numCols * numRows);
    idx = 1;
    for row = 1:numRows
        for col = 1:numCols
            r = (row-1)*frameSize + (1:frameSize);
            c = (col-1)*frameSize + (1:frameSize);
            frames{idx} = img(r, c, :);
            idx = idx + 1;
        end
    end
end

function frames = transformFrames(baseFrames, cwRotations, flipLR)
    % Apply horizontal flip then clockwise rotation to each frame.
    % cwRotations: number of 90-degree clockwise rotations (0-3)
    numFrames = numel(baseFrames);
    frames = cell(1, numFrames);
    for f = 1:numFrames
        frame = baseFrames{f};
        if flipLR
            frame = fliplr(frame);
        end
        if cwRotations > 0
            % rot90 rotates counterclockwise, so rot90(x, 4-k) = clockwise k
            frame = rot90(frame, 4 - cwRotations);
        end
        frames{f} = frame;
    end
end

function subsets = getNonemptySubsets(n)
    % Return all non-empty subsets of 1:n as a cell array of index vectors.
    numSubsets = 2^n - 1;
    subsets = cell(numSubsets, 1);
    for i = 1:numSubsets
        subsets{i} = find(bitget(i, 1:n));
    end
end

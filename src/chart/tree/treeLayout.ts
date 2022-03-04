/*
* Licensed to the Apache Software Foundation (ASF) under one
* or more contributor license agreements.  See the NOTICE file
* distributed with this work for additional information
* regarding copyright ownership.  The ASF licenses this file
* to you under the Apache License, Version 2.0 (the
* "License"); you may not use this file except in compliance
* with the License.  You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing,
* software distributed under the License is distributed on an
* "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
* KIND, either express or implied.  See the License for the
* specific language governing permissions and limitations
* under the License.
*/

import {
    eachAfter,
    eachBefore
} from './traversalHelper';
import {
    init,
    firstWalk,
    secondWalk,
    separation as sep,
    radialCoordinate,
    getViewRect,
    TreeLayoutNode
} from './layoutHelper';
import GlobalModel from '../../model/Global';
import ExtensionAPI from '../../core/ExtensionAPI';
import TreeSeriesModel from './TreeSeries';

export default function treeLayout(ecModel: GlobalModel, api: ExtensionAPI) {
    ecModel.eachSeriesByType('tree', function (seriesModel: TreeSeriesModel) {
        commonLayout(seriesModel, api);
    });
}

/**
 * The implementation of these functions was originally copied from "d3.js"
 * <https://github.com/d3/d3-hierarchy/blob/main/src/cluster.js>
 * with some modifications made for this program.
 */
function defaultSeparation(a: TreeLayoutNode, b: TreeLayoutNode) {
    return a.parentNode === b.parentNode ? 1 : 2;
}

function meanX(node: TreeLayoutNode) {
    let children = node.children
    return children.reduce(meanXReduce, 0) / children.length;
}

function meanXReduce(x: number, c: TreeLayoutNode) {
    return x + c.getLayout().x;
}

function maxY(node: TreeLayoutNode) {
    let children = node.children;
    return 1 + children.reduce(maxYReduce, 0);
}

function maxYReduce(y: number, c: TreeLayoutNode): number {
    return Math.max(y, c.getLayout().y);
}

function getRightMostLeaf(node: TreeLayoutNode): TreeLayoutNode {
    let children = node.children;
    while (children.length > 0 && node.isExpand) {
        node = children[children.length - 1];
        children = node.children;
    }
    return node
}

function getLeftMostLeaf(node: TreeLayoutNode): TreeLayoutNode {
    let children = node.children;
    while (children.length > 0 && node.isExpand) {
        node = children[0];
        children = node.children;
    }
    return node
}

function preOrderTraversalTree(root: TreeLayoutNode, callback: (node: TreeLayoutNode) => void) { // Pre-order traversal Root-Left-Right (DFS)
    const nodes = [root];
    const next = [];
    let node;
    while (node = nodes.pop()) {
        next.push(node);
        if (node.children.length && node.isExpand) {
            const children = node.children;
            if (children.length) {
                for (let i = 0; i < children.length; i++) {
                    nodes.push(children[i]);
                }
            }
        }
    }
    while (node = next.pop()) {
        callback(node);
    }
}

function getRootDist(root: TreeLayoutNode) : number[]{
    let rootDists = [];
    const nodes = [root];
    let node;
    while (node = nodes.pop()){
        if (node.children.length > 0 && node.isExpand){
            const children = node.children;
            if (children.length) {
                for (let i = 0; i < children.length; i++) {
                    children[i].rootDist = children[i].parentNode.rootDist + children[i].branchLength;
                    rootDists.push(children[i].rootDist);
                    nodes.push(children[i]);
                }
            }
        }
    }
    return rootDists
}

function scaleBranchLength(nodeDist: number, minScale: number, maxScale: number, min: number, max: number): number {
  return (maxScale - minScale) * (nodeDist - min) / (max - min) + minScale;
}

function commonLayout(seriesModel: TreeSeriesModel, api: ExtensionAPI) {
    const layoutInfo = getViewRect(seriesModel, api);
    seriesModel.layoutInfo = layoutInfo;
    const layout = seriesModel.get('layout');
    let width = layoutInfo.width;
    let height = layoutInfo.height;

    let separation = defaultSeparation;
    let coorX, coorY, coorYScale, coorXScale;
    let previousNode: TreeLayoutNode, x = 0;

    const virtualRoot = seriesModel.getData().tree.root as TreeLayoutNode;
    const realRoot = virtualRoot.children[0];
    preOrderTraversalTree(realRoot, function (node: TreeLayoutNode){
        if (node.children.length > 0){
            coorX = meanX(node);
            coorY = maxY(node);
            node.setLayout({x: coorX, y: coorY}, true)
        }else{
            coorX = previousNode ? x += separation(node, previousNode) : 0;
            coorY = 0;
            node.setLayout({x: coorX, y: coorY}, true)
            previousNode = node;
        }
    })
    let leftMostLeaf = getLeftMostLeaf(realRoot);
    let rightMostLeaf = getRightMostLeaf(realRoot);
    let x0 = leftMostLeaf.getLayout().x - separation(leftMostLeaf, rightMostLeaf)/2;
    let x1 = rightMostLeaf.getLayout().x + separation(rightMostLeaf, leftMostLeaf)/2;
    let maxDist = getRootDist(realRoot).reduce(function (a: number,b:number) :number{
        return Math.max(a,b)
    });
    const orient = seriesModel.getOrient();
    preOrderTraversalTree(realRoot, function (node: TreeLayoutNode){
        if (orient === "TB"){
            coorX = (node.getLayout().x - x0) / (x1 - x0) * width;
            coorY = (1 - (realRoot.getLayout().y ? node.getLayout().y / realRoot.getLayout().y : 1)) * height;
            coorYScale = scaleBranchLength(node.rootDist, 0, height, 0, maxDist);
            node.setLayout({x: coorX, y: coorYScale}, true);
        }else if (orient === "LR"){
            coorX = (1 - (realRoot.getLayout().y ? node.getLayout().y / realRoot.getLayout().y : 1)) * width;
            coorY = (node.getLayout().x - x0) / (x1 - x0) * height;
            coorXScale = scaleBranchLength(node.rootDist, 0, width, 0, maxDist);
            node.setLayout({x: coorXScale, y: coorY}, true);
        }
    })
}

/*
function commonLayout(seriesModel: TreeSeriesModel, api: ExtensionAPI) {
    const layoutInfo = getViewRect(seriesModel, api);
    seriesModel.layoutInfo = layoutInfo;
    const layout = seriesModel.get('layout');
    let width = 0;
    let height = 0;
    let separation = null;

    if (layout === 'radial') {
        width = 2 * Math.PI;
        height = Math.min(layoutInfo.height, layoutInfo.width) / 2;
        separation = sep(function (node1, node2) {
            return (node1.parentNode === node2.parentNode ? 1 : 2) / node1.depth;
        });
    }
    else {
        width = layoutInfo.width;
        height = layoutInfo.height;
        separation = sep();
    }

    const virtualRoot = seriesModel.getData().tree.root as TreeLayoutNode;
    const realRoot = virtualRoot.children[0];

    if (realRoot) {
        init(virtualRoot);
        eachAfter(realRoot, firstWalk, separation);
        virtualRoot.hierNode.modifier = -realRoot.hierNode.prelim;
        eachBefore(realRoot, secondWalk);

        let left = realRoot;
        let right = realRoot;
        let bottom = realRoot;
        eachBefore(realRoot, function (node: TreeLayoutNode) {
            const x = node.getLayout().x;
            if (x < left.getLayout().x) {
                left = node;
            }
            if (x > right.getLayout().x) {
                right = node;
            }
            if (node.depth > bottom.depth) {
                bottom = node;
            }
        });

        const delta = left === right ? 1 : separation(left, right) / 2;
        const tx = delta - left.getLayout().x;
        let kx = 0;
        let ky = 0;
        let coorX = 0;
        let coorY = 0;
        if (layout === 'radial') {
            kx = width / (right.getLayout().x + delta + tx);
            // here we use (node.depth - 1), bucause the real root's depth is 1
            ky = height / ((bottom.depth - 1) || 1);
            eachBefore(realRoot, function (node) {
                coorX = (node.getLayout().x + tx) * kx;
                coorY = (node.depth - 1) * ky;
                const finalCoor = radialCoordinate(coorX, coorY);
                node.setLayout({x: finalCoor.x, y: finalCoor.y, rawX: coorX, rawY: coorY}, true);
            });
        }
        else {
            const orient = seriesModel.getOrient();
            if (orient === 'RL' || orient === 'LR') {
                ky = height / (right.getLayout().x + delta + tx);
                kx = width / ((bottom.depth - 1) || 1);
                eachBefore(realRoot, function (node) {
                    coorY = (node.getLayout().x + tx) * ky;
                    coorX = orient === 'LR'
                        ? (node.depth - 1) * kx
                        : width - (node.depth - 1) * kx;
                    node.setLayout({x: coorX, y: coorY}, true);
                });
            }
            else if (orient === 'TB' || orient === 'BT') {
                kx = width / (right.getLayout().x + delta + tx);
                ky = height / ((bottom.depth - 1) || 1);
                eachBefore(realRoot, function (node) {
                    coorX = (node.getLayout().x + tx) * kx;
                    coorY = orient === 'TB'
                        ? (node.depth - 1) * ky
                        : height - (node.depth - 1) * ky;
                    node.setLayout({x: coorX, y: coorY}, true);
                });
            }
        }
    }
}
 */

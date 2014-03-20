"use strict";

var dagreD3 = require('dagre-d3');
var d3 = require('d3');

/*

Given a JSON object with the knowledge data, create a graph object which
will be rendered by dagre-d3.

json: TODO describe what the json should look like

*/
var createGraph = function(json) {
  var graph = new dagreD3.Digraph();
  // Add all the concepts as nodes
  json.concepts.forEach(function(concept) {
    graph.addNode(concept.id, {
     label: concept.name,
     concept: concept,
    });
  });
  // Check each concept for dependencies and add them as edges
  json.concepts.forEach(function(concept) {
    if (Array.isArray(concept.dependencies)) {
      concept.dependencies.forEach(function(dep) {
        // Add an edge from the dependency to the concept with a null edge ID
        graph.addEdge(null, dep, concept.id);
      });
    } else {
      // Dependencies is undefine/not an array and we'll figure out what to do with it later
    }
  });
  return graph;
};

/*

Creates the points for the paths that make up the edges
Offsets the in/out edges to above/below given nodes

Replaces the default dagre-d3 PositionEdgePaths function
*/
function positionEdgePaths(g, svgEdgePaths) {
  var interpolate = this._edgeInterpolate,
      tension = this._edgeTension;

  function calcPoints(e) {
    var value = g.edge(e);
    var source = g.node(g.incidentNodes(e)[0]);
    var target = g.node(g.incidentNodes(e)[1]);
    var points = value.points.slice();

    var p0 = points.length === 0 ? target : points[0];
    var p1 = points.length === 0 ? source : points[points.length - 1];

    points.unshift(nodePosition(source, p0));
    points.push(nodePosition(target, p1));

    return d3.svg.line()
      .x(function(d) { return d.x; })
      .y(function(d) { return d.y; })
      .interpolate(interpolate)
      .tension(tension)
      (points);
  }

  svgEdgePaths.filter('.enter').selectAll('path')
      .attr('d', calcPoints);

  this._transition(svgEdgePaths.selectAll('path'))
      .attr('d', calcPoints)
      .style('opacity', 1);
}

function nodePosition(node, point) {
  var x = node.x;
  var y = node.y;
  var r = 25;
  
  var dx = point.x - x;
  var dy = point.y - y;

  // Length of the line from the circle to the point
  var l = Math.sqrt(dx*dx + dy*dy);
  // Unit values
  var dxu = dx/l;
  var dyu = dy/l;

  // Offset above/below depending whether the line is up or down
  var offset = ((dy > 0) ? 1 : -1) * node.height/4;

  return {x: x + dxu*r, y: y + offset + dyu*r}; 
}

/*

Create a knowledge graph display that layouts out the entire graph.

config: an object that contains the data about the graph and various other
options
The available options are:
  graph: a JSON object that contains the graph data

*/
var create = function(config) {
  var graph = createGraph(config.graph);

  // Create an element on the page for us to render our graph in
  var element = d3.select('body').append('svg');

  // Use dagre-d3 to render the graph
  var renderer = new dagreD3.Renderer();

  // Update the way edges are positioned
  renderer.layout().rankSep(100);
  renderer.positionEdgePaths(positionEdgePaths);

  var redraw = function() {
    renderer.zoomSetup(function(graph, svg) { return svg; });
    renderer.run(graph, element);
  };

  // Add enter/exit circles
  var drawNodes = renderer.drawNodes();
  renderer.drawNodes(function(oldGraph, root) {
    var nodes = drawNodes(graph, root);

    // Add enter/above
    var enter = nodes.insert('circle', 'rect')
      .attr('r', 25)
      .attr('cy', function() {
        return -nodes.selectAll('rect').attr('height')/2;
      });

    enter.on('click', function(conceptId) {
      // Create a new concept
      var newConcept = {
        id: "node-"+graph.nodes().length,
        name: '',
        dependencies: [],
      };

      // Add it as a dependency to the concept clicked on
      var concept = graph.node(conceptId).concept;

      if (concept.dependencies) {
        concept.dependencies.push(newConcept.id);
      } else {
        concept.dependencies = [newConcept.id];
      }

      // Add it to the graph
      graph.addNode(newConcept.id, {
        label: newConcept.name,
        concept: newConcept,
      });
      graph.addEdge(null, newConcept.id, conceptId);
      redraw();
    });
    
    // Add exit/below
    var exit = nodes.insert('circle', 'rect')
      .attr('r', 25)
      .attr('cy', function() {
        return nodes.selectAll('rect').attr('height')/2;
      });

    return nodes;
  });

  // Run the renderer
  renderer.run(graph, element);
};

var knowledgeGraph = new function() {
  this.create = create;

  return this;
}();

global.knowledgeGraph = knowledgeGraph; 
module.exports = knowledgeGraph;

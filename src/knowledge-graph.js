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

  if (json && json.concepts) {
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
          graph.addEdge(dep+'-'+concept.id, dep, concept.id);
        });
      } else {
        // Dependencies is undefine/not an array and we'll figure out what to do with it later
      }
    });
  }

  return graph;
};

/*

Creates the points for the paths that make up the edges
Offsets the in/out edges to above/below given nodes

Replaces the default dagre-d3 PositionEdgePaths function
*/
function positionEdgePaths(g, svgEdgePaths) {
  // Add an ID to each edge
  svgEdgePaths
    .attr('id', function(d) { return d; });

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

Adds entry and exit points for edges into concept elements

Used in addition to the default node rendering function

*/
function drawHamburgers(graph, nodes) {
  var kg = this;

  // Create a semi-circle path function
  var semicircle = d3.svg.arc()
    .outerRadius(20)
    .startAngle(3*Math.PI/2)
    .endAngle(5*Math.PI/2);

  // Add enter/above
  var enter = nodes.insert('path', 'rect')
    .classed('enter', true)
    .attr('d', semicircle)
    .attr('transform', function() {
      return 'translate(0,' + (-nodes.selectAll('rect').attr('height')/2) + ')';
    });

  // Flip the semi-circle
  semicircle
    .startAngle(Math.PI/2)
    .endAngle(3*Math.PI/2);
  
  // Add exit/below
  var exit = nodes.insert('path', 'rect')
    .classed('exit', true)
    .attr('d', semicircle)
    .attr('transform', function() {
      return 'translate(0,' + (nodes.selectAll('rect').attr('height')/2) + ')';
    });
}

/*

Construct a knowledge graph object.

Accepts a single object:
  config: an object that contains the data about the graph and various other
  options
  The available options are:
    graph: a JSON object that contains the graph data
    plugins: a list of plugin names or plugin objects

*/
var KnowledgeGraph = function(api, config) {
  // Create the directed graph
  var graph;
  if (config && config.graph) {
    graph = this.graph = createGraph(config.graph);
  } else {
    graph = this.graph = createGraph(); 
  }

  // Create an element on the page for us to render our graph in
  var element = this.element = d3.select('body').append('svg');

  // Use dagre-d3 to render the graph
  var renderer = this.renderer = new dagreD3.Renderer();

  // Update the way edges are positioned
  renderer.layout().rankSep(100);
  renderer.positionEdgePaths(positionEdgePaths);

  // Add transitions for graph updates
  renderer.transition(function(selection) {
    var duration;
    if (config && config.transitionDuration !== undefined) {
      duration = config.transitionDuration;
    } else {
      duration = 500;
    }

    if (duration) {
      return selection
        .transition()
          .duration(duration);
    } else {
      return selection;
    }
  });

  // Add enter/exit circles
  var kg = this;
  var drawNodes = renderer.drawNodes();
  renderer.drawNodes(function(graph, element) {
    var nodes = drawNodes(graph, element);

    // Add class labels
    nodes.attr('id', function(d) { return d; });

    // Add burger buns
    drawHamburgers.call(kg, graph, nodes);

    // Add interactivity
    kg.postEvent({
      type: 'renderGraph',
      graph: graph,
      nodes: nodes
    });

    return nodes;
  });

  /*
  Message API
  */
  this.dispatcher = {};

  this.postEvent = function(e) {
    if(this.dispatcher[e.type]) {
      var callbacks = this.dispatcher[e.type];
      callbacks.forEach(function(callback) {
        callback(e);
      });
    }
  };

  this.onEvent = function(type, callback) {
    if(undefined === this.dispatcher[type]) {
      this.dispatcher[type] = [];
    }
    this.dispatcher[type].push(callback);
  };

  /*
  Adds a concept to the graph and then updates the graph rendering

  config:
    concept: The concept object to add
    dependents: A list of concept ids dependent on this one
  */
  this.addConcept = function(config) {
    var kg = this;

    // Add node to the graph
    this.graph.addNode(config.concept.id, {
      label: config.concept.name,
      concept: config.concept,
    });

    // Add dependent edges to the graph
    if (config.dependents) {
      config.dependents.forEach(function(dep) {
        kg.addDependency({
          concept: kg.graph.node(dep).concept,
          dependency: config.concept.id,
        });
      });
    }

    // Add dependency edges to the graph
    if (config.concept.dependencies) {
      config.concept.dependencies.forEach(function(dep) {
        kg.addDependency({
          concept: config.concept,
          dependency: dep,
        });
      });
    }

    // Update the graph display
    this.render();
  };

  /*

  Adds a dependency to the graph and then updates the graph rendering

  config:
    concept: the concept which depends on another concept
    dependency: the id of the concept which is depended on
  */
  this.addDependency = function(config) {
    // Get ids of the concepts
    var concept = config.concept;
    var dep = config.dependency;

    // Add the dependency to the list of the concept's dependencies
    if (concept.dependencies && concept.dependencies.indexOf(dep) === -1) {
      concept.dependencies.push(dep);
    } else {
      concept.dependencies = [dep];
    }

    // Add the edge to the graph
    this.graph.addEdge(dep+'-'+concept.id, dep, concept.id);

    // Update the graph display
    this.render();
  };

  /*

  Removes a dependency from the graph and then updates the graph rendering

  */
  this.removeDependency = function(config) {
    // Get ids of concepts
    var con = config.concept;
    var dep = config.dependency;

    // Remove the dependency from the concept
    var concept = this.graph.node(con).concept;
    if (concept.dependencies) {
      var index = concept.dependencies.indexOf(dep);
      concept.dependencies.splice(index, 1);
    }

    // Remove the edge from the graph
    this.graph.delEdge(dep+'-'+con);

    // Update the graph display
    this.render();
  };

  /*
  
  Returns true if the graph has this dependency and false otherwise

  */
  this.hasDependency = function(config) {
    // Get ids of concepts
    var concept = config.concept;
    var dep = config.dependency;

    // Return true if edge exists
    return this.graph.hasEdge(dep+'-'+concept);
  };

  /*

  Renders/rerenders the graph elements

  */
  this.render = function() {
    // Run the renderer
    this.renderer.run(this.graph, this.element);
    
    // Don't add another element for the zoom
    this.renderer.zoomSetup(function(graph, element) {
      this.element = element;
      return element;
    });
  };

  /*

  Outputs the graph as a JSON object

  */
  this.toJSON = function() {
    var json = {
      concepts: [],
    };

    // Add all of the concepts
    this.graph.eachNode(function(id, node) {
      json.concepts.push(node.concept);
    });

    return JSON.stringify(json);
  };

  // Initialise plugins for graph.
  if(config && config.plugins) {
    for(var i = 0; i < config.plugins.length; i++) {
      var plugin = config.plugins[i];
      if('string' === typeof(plugin)) {
        plugin = api.plugins[plugin];
      }
      if(plugin && plugin.run) {
        plugin.run(this);
      }
    }
    this.__defineGetter__('plugins', function() {
      return config.plugins;
    });
    this.__defineSetter__('plugins', function() {});
  }

  // Display the graph
  this.render();

  return this;
};

/*

Public API for the knowledge-graph library

*/
var api = {
  /*

  Create a knowledge graph display that layouts out the entire graph.

  */
  create: function(config) {
    return new KnowledgeGraph(this, config);
  },

  plugins: {
    'links': require('./links-plugin.js'),
    'editing': require('./editing-plugin.js'),
    'modals': require('./modals-plugin.js'),
    'editing-modals': require('./editing-modals-plugin.js'),
  },

  registerPlugin: function(plugin) {
    if(plugin && plugin.name && plugin.run) {
      this.plugins[plugin.name] = plugin;
    }
  }
};

global.knowledgeGraph = api; 
module.exports = api;

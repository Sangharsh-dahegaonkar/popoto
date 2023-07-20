import * as d3 from "d3";
import query from "../query/query";
import provider from "../provider/provider";
import logger from "../logger/logger";
import runner from "../runner/runner";
import dataModel from "../datamodel/dataModel";

var result = {};
result.containerId = "popoto-results";
result.hasChanged = true;
result.resultCountListeners = [];
result.resultListeners = [];
result.graphResultListeners = [];
result.RESULTS_PAGE_SIZE = 10;
result.TOTAL_COUNT = false;

/**
 * Register a listener to the result count event.
 * This listener will be called on evry result change with total result count.
 */
result.onTotalResultCount = function (listener) {
  result.resultCountListeners.push(listener);
};

result.onResultReceived = function (listener) {
  result.resultListeners.push(listener);
};

result.onGraphResultReceived = function (listener) {
  result.graphResultListeners.push(listener);
};

/**
 * Parse REST returned Graph data and generate a list of nodes and edges.
 *
 * @param data
 * @returns {{nodes: Array, edges: Array}}
 */
result.parseGraphResultData = function (data) {
  var nodes = {},
    edges = {};

  data.results[1].data.forEach(function (row) {
    row.graph.nodes.forEach(function (n) {
      if (!nodes.hasOwnProperty(n.id)) {
        nodes[n.id] = n;
      }
    });

    row.graph.relationships.forEach(function (r) {
      if (!edges.hasOwnProperty(r.id)) {
        edges[r.id] = r;
      }
    });
  });

  var nodesArray = [],
    edgesArray = [];

  for (var n in nodes) {
    if (nodes.hasOwnProperty(n)) {
      nodesArray.push(nodes[n]);
    }
  }

  for (var e in edges) {
    if (edges.hasOwnProperty(e)) {
      edgesArray.push(edges[e]);
    }
  }

  return { nodes: nodesArray, edges: edgesArray };
};

result.updateResults = function () {
  if (result.hasChanged) {
    var resultsIndex = {};
    var index = 0;

    var resultQuery = query.generateResultQuery();
    result.lastGeneratedQuery = resultQuery;

    var postData = {
      statements: [
        {
          statement: resultQuery.statement,
          parameters: resultQuery.parameters,
        },
      ],
    };
    resultsIndex["results"] = index++;

    // Add Graph result query if listener found
    if (result.graphResultListeners.length > 0) {
      var graphQuery = query.generateResultQuery(true);
      result.lastGeneratedQuery = graphQuery;

      postData.statements.push({
        statement: graphQuery.statement,
        parameters: graphQuery.parameters,
      });
      resultsIndex["graph"] = index++;
    }

    if (result.TOTAL_COUNT === true && result.resultCountListeners.length > 0) {
      var nodeCountQuery = query.generateNodeCountQuery(
        dataModel.getRootNode()
      );
      postData.statements.push({
        statement: nodeCountQuery.statement,
        parameters: nodeCountQuery.parameters,
      });
      resultsIndex["total"] = index++;
    }

    logger.info("Results ==>");

    runner
      .run(postData)
      .then(function (res) {
        logger.info("<== Results");

        var parsedData = runner.toObject(res);

        var resultObjects = parsedData[resultsIndex["results"]].map(function (
          d,
          i
        ) {
          return {
            resultIndex: i,
            label: dataModel.getRootNode().label,
            attributes: d,
          };
        });

        result.lastResults = resultObjects;

        if (resultsIndex.hasOwnProperty("total")) {
          var count = parsedData[resultsIndex["total"]][0].count;

          // Notify listeners
          result.resultCountListeners.forEach(function (listener) {
            listener(count);
          });
        }

        // Notify listeners
        result.resultListeners.forEach(function (listener) {
          listener(resultObjects);
        });

        if (result.graphResultListeners.length > 0) {
          var graphResultObjects = result.parseGraphResultData(response);
          result.graphResultListeners.forEach(function (listener) {
            listener(graphResultObjects);
          });
        }

        // Update displayed results only if needed ()
        if (result.isActive) {
          // Clear all results
          var results = d3
            .select("#" + result.containerId)
            .selectAll(".ppt-result")
            .data([]);
          results.exit().remove();

          // copy first element
          var firstElement = resultObjects[0];
          resultObjects.unshift(firstElement);

          // update result header
          results = d3
            .select("#" + result.containerId)
            .selectAll(".ppt-result")
            .data([firstElement], function (d) {
              return d.resultIndex;
            });

          // Add new elements
          var headerElement = results
            .enter()
            .append("th")
            .attr("class", "ppt-result")
            .attr("id", function (d) {
              return "popoto-result-" + d.resultIndex;
            });

          // Generate results with providers
          headerElement.each(function (d) {
            provider.node.getDisplayResults(d.label)(d3.select(this));
          });

          // Update data
          var resultsBody = d3
            .select("#" + result.containerId)
            .selectAll(".ppt-result")
            .data(resultObjects, function (d) {
              return d.resultIndex;
            });

          // Add new elements
          var pElmt = resultsBody
            .enter()
            .append("tr")
            .attr("class", "ppt-result")
            .attr("id", function (d) {
              return "popoto-result-" + d.resultIndex;
            });
          console.log("sma log from result");
          // Generate results with providers
          pElmt.each(function (d) {
            provider.node.getDisplayResults(d.label)(d3.select(this));
          });
        }

        result.hasChanged = false;
      })
      .catch(function (error) {
        logger.error(error);

        // Notify listeners
        result.resultListeners.forEach(function (listener) {
          listener([]);
        });
      });
  }
};

result.updateResultsCount = function () {
  // Update result counts with root node count
  if (result.resultCountListeners.length > 0) {
    result.resultCountListeners.forEach(function (listener) {
      listener(dataModel.getRootNode().count);
    });
  }
};

result.generatePreQuery = function () {
  var p = { ids: [] };

  result.lastResults.forEach(function (d) {
    p.ids.push(d.attributes.id);
  });

  return {
    query: "MATCH (d) WHERE d.id IN $ids WITH d",
    param: p,
  };
};

export default result;

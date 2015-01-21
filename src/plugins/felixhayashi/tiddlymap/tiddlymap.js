/*\

title: $:/plugins/felixhayashi/tiddlymap/tiddlymap.js
type: application/javascript
module-type: widget

@preserve

\*/

(function(){

  /*jslint node: true, browser: true */
  /*global $tw: false */
  
  "use strict";
  
  /**************************** IMPORTS ****************************/
   
  var Widget = require("$:/core/modules/widgets/widget.js").widget;
  var DropZoneWidget = require("$:/core/modules/widgets/dropzone.js").dropzone;
  var ViewAbstraction = require("$:/plugins/felixhayashi/tiddlymap/view_abstraction.js").ViewAbstraction;
  var CallbackRegistry = require("$:/plugins/felixhayashi/tiddlymap/callback_registry.js").CallbackRegistry;
  var DialogManager = require("$:/plugins/felixhayashi/tiddlymap/dialog_manager.js").DialogManager;
  var utils = require("$:/plugins/felixhayashi/tiddlymap/utils.js").utils;
  var vis = require("$:/plugins/felixhayashi/vis/vis.js");

  /***************************** CODE ******************************/
        
  /**
   * @constructor
   */
  var TiddlyMapWidget = function(parseTreeNode, options) {
    
    // Main initialisation inherited from widget.js
    this.initialise(parseTreeNode, options);
    
    // create shortcuts and aliases
    this.adapter = $tw.tiddlymap.adapter;
    this.opt = $tw.tiddlymap.opt;
    this.notify = $tw.tiddlymap.notify;
    
    // key (a tiddler) -> callback (called when tiddler changes)
    this.callbackRegistry = new CallbackRegistry();
    this.dialogManager = new DialogManager(this, this.callbackRegistry);
        
    // https://github.com/Jermolene/TiddlyWiki5/blob/master/core/modules/widgets/widget.js#L211
    this.computeAttributes();
    
    // register whether in editor mode or not
    this.editorMode = this.getAttribute("editor");
    
    if(this.editorMode) {
      // addEventListeners automatically binds "this" object to handler, thus, no need for .bind(this)
      this.addEventListeners([
        {type: "tm-create-view", handler: this.handleCreateView },
        {type: "tm-rename-view", handler: this.handleRenameView },
        {type: "tm-delete-view", handler: this.handleDeleteView },
        {type: "tm-edit-view", handler: this.handleEditView },
        {type: "tm-store-position", handler: this.handleStorePositions },
        {type: "tm-edit-node-filter", handler: this.handleEditNodeFilter },
        {type: "tm-import-tiddlers", handler: this.handleImportTiddlers }
      ]);
    }
  };
  
  // !! EXTENSION !!
  TiddlyMapWidget.prototype = new Widget();
  // !! EXTENSION !!
    
  /**
   * This handler will open a dialog in which the user specifies an
   * edgetype to use to create an edge between to nodes.
   * 
   * Before any result is displayed to the user on the graph, the
   * relationship needs to be persisted in the store for the according
   * edgetype. If that operation was successful, each graph will instantly
   * be aware of the change as it listens to tiddler changes.
   * 
   * @param {Edge} edge - A javascript object that contains at least
   *    the properties "from", "to" and "label"
   * @param {function} [callback] - A function with the signature
   *    function(isConfirmed);
   */
  TiddlyMapWidget.prototype.handleConnectionEvent = function(edge, callback) {

    var edgeFilterExpr = this.getView().getAllEdgesFilterExpr(true);

    var vars = {
      edgeFilterExpr: edgeFilterExpr,
      fromLabel: this.adapter.selectNodeById(edge.from).label,
      toLabel: this.adapter.selectNodeById(edge.to).label
    };
    
    this.dialogManager.open("getEdgeType", vars, function(isConfirmed, outputTObj) {
    
      if(isConfirmed) {
        
        var text = utils.getText(outputTObj);
        edge.label = (text && text !== this.opt.misc.unknownEdgeLabel
                      ? text
                      : this.opt.misc.unknownEdgeLabel);

        this.adapter.insertEdge(edge, this.getView());
        
      }
      
      if(typeof callback == "function") {
        callback(isConfirmed);
      }
        
    });
    
  };
  
  /**
   * Promts a dialog that will confront the user with making a tough choice :)
   * @param {function} [callback] - A function with the signature function(isConfirmed).
   * @param {string} [message] - An small optional message to display.
   */
  TiddlyMapWidget.prototype.openStandardConfirmDialog = function(callback, message) {
  
    var param = {
      message : message,
      dialog: {
        confirmButtonLabel: "Yes, proceed",
        cancelButtonLabel: "Cancel"
      }
    };
    
    this.dialogManager.open("getConfirmation", param, callback);
  };
    
  TiddlyMapWidget.prototype.logger = function(type, message /*, more stuff*/) {
    
    var args = Array.prototype.slice.call(arguments, 1);
    args.unshift("@" + this.objectId.toUpperCase());
    args.unshift(type);
    $tw.tiddlymap.logger.apply(this, args);
    
  };
  
  /**
   * Method to render this widget into the DOM.
   * Attention: BE CAREFUL WITH THE ORDER OF FUNCTION CALLS IN THIS FUNCTION.
   * 
   * @override
   */
  TiddlyMapWidget.prototype.render = function(parent, nextSibling) {
    
    // remember our place in the dom
    this.registerParentDomNode(parent);
    
    // register storyriver dom node
    this.storyRiver = document.getElementsByClassName("tc-story-river")[0];
    this.sidebar = document.getElementsByClassName("tc-sidebar-scrollable")[0];
    
    // who am I?
    this.objectId = (this.getAttribute("object-id")
                     ? this.getAttribute("object-id")
                     : utils.genUUID());
    
    // get view and view holder
    this.viewHolderRef = this.getViewHolderRef();
    this.view = this.getView();
            
    // first append the bar if we are in editor mode
    this.initAndRenderEditorBar(parent);
        
    // now initialise graph variables and render the graph
    this.initAndRenderGraph(parent);
    
    // register this graph at the caretaker's graph registry
    $tw.tiddlymap.registry.push(this);
    
  };
  
  /**
   * Add some classes to give the user a chance to apply some css
   * to different graph modes.
   */
  TiddlyMapWidget.prototype.registerParentDomNode = function(parent) {
    this.parentDomNode = parent;
    if(!$tw.utils.hasClass(parent, "tiddlymap")) {
      $tw.utils.addClass(parent, "tiddlymap");
      if(this.getAttribute("click-to-use") !== "false") {
        $tw.utils.addClass(parent, "click-to-use");
      }
      if(this.getAttribute("editor") === "advanced") {
        $tw.utils.addClass(parent, "advanced-editor");
      }
      if(this.getAttribute("class")) {
        $tw.utils.addClass(parent, this.getAttribute("class"));
      }
    }
  };
  
  /**
   * The editor bar contains a bunch of widgets that allow the user
   * to manipulate the current view.
   * 
   * @param {Element} parent The dom node in which the editor bar will
   *     be injected in.
   */
  TiddlyMapWidget.prototype.initAndRenderEditorBar = function(parent) {
    
    if(this.editorMode === "advanced") {
    
      this.graphBarDomNode = document.createElement("div");
      $tw.utils.addClass(this.graphBarDomNode, "filterbar");
      parent.appendChild(this.graphBarDomNode);
      
      this.rebuildEditorBar();
      this.renderChildren(this.graphBarDomNode);
      
    }
    
  };

  /**
   * Creates this widget's child-widgets.
   * 
   * @see https://groups.google.com/forum/#!topic/tiddlywikidev/sJrblP4A0o4
   */
  TiddlyMapWidget.prototype.rebuildEditorBar = function() {
    
    if(this.editorMode === "advanced") {
    
      // register variables
      this.setVariable("var.viewLabel", this.getView().getLabel());
      this.setVariable("var.isViewBound", String(this.isViewBound()));
      this.setVariable("var.ref.view", this.getView().getRoot());
      this.setVariable("var.ref.viewHolder", this.getViewHolderRef());
      this.setVariable("var.ref.edgeFilter", this.getView().getPaths().edgeFilter);
      this.setVariable("var.edgeFilterExpr", this.view.getAllEdgesFilterExpr());
      
      // Construct the child widget tree
      var body = {
        type: "tiddler",
        attributes: {
          tiddler: { type: "string", value: this.getView().getRoot() }
        },
        children: [{
          type: "transclude",
          attributes: {
            tiddler: { type: "string", value: this.opt.ref.graphBar }
          }
        }]
      };
          
      this.makeChildWidgets([body]);
      
    }
  };
      
  /**
   * This function is called by the system to notify the widget about
   * tiddler changes.
   * 
   * The changes are analyzed by several functions.
   * 
   * 1. checking for callbacks: some processes decided at runtime to 
   * listen to changes of single tiddlers (for example dialogs waiting
   * for results). So at first it is checked if a callback is triggered.
   * 
   * 2. checking for view changes: a view may be replaced (switched)
   * or modified. This will result in recalculation of the graph.
   * 
   * 3. checking for graph refresh: does the graph need an update
   * because nodes/edges have been modified, added or removed or the
   * view has changed?
   * 
   * 4. checking for graphbar refresh: Did some widgets need a rerendering
   * due to changes that affect the topbar (view switched or modified)?
   * 
   * @override Widget.refresh();
   * @see https://groups.google.com/d/msg/tiddlywikidev/hwtX59tKsIk/EWSG9glqCnsJ
   */
  TiddlyMapWidget.prototype.refresh = function(changedTiddlers) {
        
    // in any case, check for callbacks triggered by tiddlers
    this.callbackRegistry.handleChanges(changedTiddlers);
    
    var isViewSwitched = this.isViewSwitched(changedTiddlers);
    var viewModifications = this.getView().refresh(changedTiddlers);
            
    if(isViewSwitched || viewModifications.length) {
    
      if(isViewSwitched) {
        this.logger("warn", "View switched");
        this.view = this.getView(true);
      } else {
        this.logger("warn", "View modified", viewModifications);
      }
            
      // rebuild
      this.rebuildGraph(true);      
      
    } else {
      
      // check for changes that effect the graph on an element level
      this.checkOnGraph(changedTiddlers);
            
    }
    
    if(this.editorMode) {
      // in any case give child widgets a chance to refresh
      this.checkOnEditorBar(changedTiddlers, isViewSwitched, viewModifications);
    }

  };
  
  /**
   * param {NodeCollection} [nodes] - An optional set of nodes to use
   * instead of the set created according to the nodes filter.
   */
  TiddlyMapWidget.prototype.rebuildGraph = function(isResetContext) {
    
    this.logger("debug", "Rebuilding graph");
    
    // always reset to allow handling of stabilized-event!
    this.hasNetworkStabilized = false;
        
    if(isResetContext) { // those resets executed BEFORE the data-refresh
      this.graphOptions = this.getGraphOptions();
      this.network.setOptions(this.graphOptions);
    }
    
    this.graphData = this.getGraphData(true);

    if(isResetContext) { // those resets executed AFTER the data-refresh
      if(!this.preventNextContextReset) {
        this.fitGraph(2000);
        this.preventNextContextReset = false;
        
      }
    }

  };
  
  /**
   * Warning: Do not change this functionname as it is used by the
   * caretaker's routinely checkups.
   */
  TiddlyMapWidget.prototype.getContainer = function() {
    return this.parentDomNode;
  }
  
  /**
   * param {boolean} isRebuild
   * param {NodeCollection} [nodes] - An optional set of nodes to use
   *     instead of the set created according to the nodes filter. Supplying
   *     a nodes collection will always recreate the cache despite the value
   *     of `isRebuild`.
   */
  TiddlyMapWidget.prototype.getGraphData = function(isRebuild) {
      
    if(!isRebuild && this.graphData) {
      return this.graphData;
    }
    
    // calculate original nodes in form of a hashmap
          
    var nodeFilter = this.getView().getNodeFilter("compiled");
    var nodes = this.adapter.selectNodesByFilter(nodeFilter, {
      view: this.getView(),
      outputType: "hashmap",
      addProperties: {
        group: "matches"
      }
    });

    
    // add special nodes
    
    if(this.getView().getLabel() === "quick_connect") { // special case; ugly solved!
      
      var curNode = this.adapter.selectNodesByReference([ this.getVariable("currentTiddler") ], {
        outputType: "hashmap",
        addProperties: {
          group: "special",
          x: 1, // WARNING VIS BUG: never use 0 as coordinate!
          y: 1
        }
      });
      
      utils.inject(curNode, nodes);
      
    }
    
    // retrieve edges
    
    var edges = this.adapter.selectEdgesByEndpoints(nodes, {
      view: this.getView(),
      outputType: "hashmap",
      endpointsInSet: ">=1" // ">=1" used to calculate neighbours
    });
    
    // retrieve and inject neighbours
        
    if(this.getView().isConfEnabled("display_neighbours")) {
      var neighbours = this.adapter.selectNeighbours(nodes, {
        edges: edges,
        outputType: "hashmap",
        view: this.getView(),
        addProperties: {
          group: "neighbours"
        }
      });
      utils.inject(neighbours, nodes);
    }
    
    // calculate levels if layout is set to hierarchical
    
    if(this.getView().getConfig("layout.active") === "hierarchical") {
      this.setHierarchy(nodes, edges, this.getView().getHierarchyEdgeTypes());
    }
      
    // refresh datasets
    
    if(!this.graphData) this.graphData = utils.getEmptyMap();
    
    this.graphData.nodes = utils.refresh(nodes, // new nodes
                                         this.graphData.nodesById, // old nodes
                                         this.graphData.nodes); // dataset
                                                                                  
    this.graphData.edges = utils.refresh(edges, // new edges
                                         this.graphData.edgesById, // old edges
                                         this.graphData.edges); // dataset
                                       
    // create lookup tables
    
    this.graphData.nodesByRef = utils.getLookupTable(nodes, "ref");
    this.graphData.nodesById = nodes;
    this.graphData.edgesById = edges;

    return this.graphData;
        
  };

  TiddlyMapWidget.prototype.setHierarchy = function(nodes, edges, hierarchyEdgeTypes) {

    // Definition of the recursive function that is responsible for assigning ids.
    
    function assignLevel(curNode, level) {
      
      if(curNode.level) return; // already visited
      
      curNode.level = level;
      
      for(var id in edges) {
        var edge = edges[id];
        if(edge.from === curNode.id) { // outgoing connection
          var toNode = nodes[edge.to];
          if(hierarchyEdgeTypes[edge.label]) { // edge that defines the hierarchical order
            assignLevel(toNode, level + 1); // child of curNode
          } else { // hierarchically equal relationship
            assignLevel(toNode, level);
          }
        } else if(edge.to === curNode.id) { // incoming connection
          var fromNode = nodes[edge.from];
          if(hierarchyEdgeTypes[edge.label]) { // edge that defines the hierarchical order
            assignLevel(fromNode, level - 1); // parent of curNode
          } else { // hierarchically equal relationship
            assignLevel(fromNode, level);
          }
        }
      }             
    }

    loop1: for(var nodeId in nodes) {
      for(var id in edges) {
        if(nodes[nodeId].level || nodes[nodeId].id === edges[id].to) {
          // already assigned a level or not a root node
          continue loop1;
        }
      }
      assignLevel(nodes[nodeId], 1000);
    }

  };  
  
  TiddlyMapWidget.prototype.isViewBound = function() {
    
    return utils.startsWith(this.getViewHolderRef(),
                            this.opt.path.localHolders);  
    
  };  
  
  TiddlyMapWidget.prototype.isViewSwitched = function(changedTiddlers) {
  
    if(this.isViewBound()) {
      return false; // bound views can never be switched!
    } else {
      return utils.hasOwnProp(changedTiddlers, this.getViewHolderRef());
    }
    
  };
  
  /**
   * This method will ckeck if any tw-widget needs a refresh.
   */
  TiddlyMapWidget.prototype.checkOnEditorBar = function(changedTiddlers, isViewSwitched, viewModifications) {
    
    // @TODO viewModifications is actually really heavy. I could narrow this.
    if(isViewSwitched || viewModifications.length) {
      
      // full rebuild
      //this.logger("info", "The graphbar needs a full refresh");
      this.removeChildDomNodes();
      // update all variables and build the tree
      this.rebuildEditorBar();
      this.renderChildren(this.graphBarDomNode);
      return true;
      
    } else {
      
      // let children decide for themselves
      //this.logger("info", "Propagate refresh to childwidgets");
      return this.refreshChildren(changedTiddlers);
      
    }
    
  };
  
  /**
   * Rebuild or update the graph if one of the following events occured:
   * 
   * 1. A node that matches the node filter has been added or modified.
   * 2. A node that once matched the node filter has been removed
   * 3. An edge that matches the edge filter has been added or removed.
   * 
   */
  TiddlyMapWidget.prototype.checkOnGraph = function(changedTiddlers) {
            
    var nodeFilter = this.getView().getNodeFilter("compiled");
    
    var matchingChangedNodes = utils.getMatches(nodeFilter, Object.keys(changedTiddlers));
                                  
    // check for updated or modified nodes that match the filter
    if(matchingChangedNodes.length) {
      
      this.logger("info", "Modified nodes", matchingChangedNodes);
      this.rebuildGraph();
      return;
      
    } else { // no node matches
      // check for nodes that do not match the filter anymore
      for(var tRef in changedTiddlers) {
        if(this.graphData.nodesByRef[tRef]) {
          this.logger("info", "Obsolete node", matchingChangedNodes);
          this.rebuildGraph();
          return;
          
        }
      }
    }
    
    var edgeFilter = this.getView().getEdgeFilter("compiled");
    var changedEdgestores = utils.getMatches(edgeFilter, Object.keys(changedTiddlers));
    
    if(changedEdgestores.length) {
      
      this.logger("info", "Changed edge stores", changedEdgestores);
      this.rebuildGraph();
      return;
    
    }

  };
      
  /**
   * Rebuild the graph
   * 
   * @see
   *   - http://visjs.org/docs/network.html
   *   - http://visjs.org/docs/dataset.html
   */
  TiddlyMapWidget.prototype.initAndRenderGraph = function(parent) {
    
    this.logger("info", "Initializing and rendering the graph");
        
    if(this.editorMode) {
      // we do **not** register this child via this.children.push(dropZoneWidget);
      // as this would cause the graph to be destroyed on the next refreshWidgets
      var dropZoneWidget = this.makeChildWidget({ type: "dropzone" });
      var self = this;
      dropZoneWidget.handleDropEvent = function(event) {
        self.lastImportDropCoordinates = {
          x: event.clientX,
          y: event.clientY
        }
        DropZoneWidget.prototype.handleDropEvent.call(this, event);
      };
      dropZoneWidget.render(parent); 
      this.graphDomNode = dropZoneWidget.findFirstDomNode();
    } else {
      this.graphDomNode = document.createElement("div");
      parent.appendChild(this.graphDomNode);
    }
        
    $tw.utils.addClass(this.graphDomNode, "vis-graph");

    // in contrast to the graph height, which is assigned to the vis
    // graph wrapper, the graph width is assigned to the parent
    parent.style["width"] = this.getAttribute("width", "100%");
    
    window.addEventListener("resize", this.handleResizeEvent.bind(this), false);
    window.addEventListener("click", this.handleClickEvent.bind(this), false);
    window.addEventListener(utils.getFullScreenApis()["_fullscreenChange"], this.handleFullScreenChange.bind(this), false);
    
    this.handleResizeEvent();

    // register options and data
    this.graphOptions = this.getGraphOptions(); 
    this.graphData = this.getGraphData(); 

    // init the graph with dummy data as events are not registered yet
    this.network = new vis.Network(this.graphDomNode, this.graphData, this.graphOptions);
                
    // repaint when sidebar is hidden
    this.callbackRegistry.add("$:/state/sidebar", this.repaintGraph.bind(this), false);
    
    // listen to refresh-trigger changes if trigger is provided
    var refreshTrigger = this.getAttribute("refresh-trigger");
    if(utils.tiddlerExists(refreshTrigger)) {
      this.callbackRegistry.add(refreshTrigger, this.handleTriggeredRefresh.bind(this), false);
    }
    
    // register events
    
    this.network.on("doubleClick", this.handleDoubleClickEvent.bind(this));
    this.network.on("stabilized", this.handleStabilizedEvent.bind(this));
    this.network.on('dragStart', this.handleNodeDragStart.bind(this));
    this.network.on("dragEnd", this.handleNodeDragEnd.bind(this));
    
    this.addGraphButtons({
      "fullscreen": this.handleToggleFullscreen
    });
    
    this.setGraphButtonEnabled("fullscreen", true);
        
  };
  
  TiddlyMapWidget.prototype.getGraphOptions = function() {
    
    // current vis options can be found at $tw.tiddlymap.logger("log", this.network.constants);
    
    if(!this.graphOptions) {
      // get a copy of the options
      var options = $tw.utils.extendDeepCopy(this.opt.user.vis);
          
      options.onDelete = function(data, callback) {
        this.handleRemoveElement(data);
      }.bind(this);
      options.onConnect = function(data, callback) {
        this.handleConnectionEvent(data);
      }.bind(this);
      options.onAdd = function(data, callback) {
        this.handleInsertNode(data);
      }.bind(this);
      options.onEditEdge = function(data, callback) {
        var changedData = this.handleReconnectEdge(data);
      }.bind(this);

      options.dataManipulation = {
        enabled : (this.editorMode ? true : false),
        initiallyVisible : true
      };
        
      options.navigation = true;
      options.clickToUse = (this.getAttribute("click-to-use") !== "false");
      
    } else {
      var options = this.graphOptions;
    }
    
    if(this.getView().getConfig("layout.active") === "hierarchical") {
      options.hierarchicalLayout.enabled = true;
      options.hierarchicalLayout.layout = "direction";
    } else {
      options.hierarchicalLayout.enabled = false;
    }

    return options;
    
  };
    
  /**
   * Create an empty view. A dialog is opened that asks the user how to
   * name the view. The view is then registered as current view.
   */
  TiddlyMapWidget.prototype.handleCreateView = function() {
    
    this.dialogManager.open("getViewName", null, function(isConfirmed, outputTObj) {
    
      if(isConfirmed) {
        var view = this.adapter.createView(utils.getText(outputTObj));
        this.setView(view.getRoot());
      }
      
    });
    
  };

  TiddlyMapWidget.prototype.handleTriggeredRefresh = function(trigger) {
    this.logger("log", "Tiddler", trigger, "triggered a refresh");
    this.rebuildGraph(true);
  };
  
  TiddlyMapWidget.prototype.handleRenameView = function() {
    
    if(this.getView().getLabel() === "default") {
      this.notify("Thou shalt not rename the default view!");
      return;
    }
    
    this.dialogManager.open("getViewName", null, function(isConfirmed, outputTObj) {
    
      if(isConfirmed) {
        this.view.rename(utils.getText(outputTObj));
        this.setView(this.view.getRoot());
      }

    });
    
  };
  
  TiddlyMapWidget.prototype.handleEditView = function() {
    
    var params = {
      "var.edgeFilterExpr": this.getView().getEdgeFilter("expression"),
      dialog: {
        preselects: this.getView().getConfig()
      }
    };
    
    this.dialogManager.open("editView", params, function(isConfirmed, outputTObj) {
      if(isConfirmed && outputTObj) {
        var updates = utils.getPropertiesByPrefix(outputTObj.fields, "config.");
        this.getView().setConfig(updates);
      }

    });
    
  };

  TiddlyMapWidget.prototype.handleDeleteView = function() {
    
    var viewname = this.getView().getLabel();
    
    if(viewname === "default") {
      this.notify("Thou shalt not kill the default view!");
      return;
    }
    
    // regex is non-greedy
    var filter = "[regexp:text[<\\$tiddlymap.*?view=." + viewname + "..*?>]]";
    var matches = utils.getMatches(filter);
    
    if(matches.length) {
      
      var fields = {
        count : matches.length.toString(),
        filter : filter
      };

      this.dialogManager.open("cannotDeleteViewDialog", fields, null);

      return;
      
    }

    var message = "You are about to delete the view " + 
                  "''" + viewname + "'' (no tiddler currently references this view).";
                  
    this.openStandardConfirmDialog(function(isConfirmed) {
      
      if(isConfirmed) {
        this.getView().destroy();
        this.setView(this.opt.path.views + "/default");
        this.notify("view \"" + viewname + "\" deleted ");
      }

    }, message);
    
  };
  
  TiddlyMapWidget.prototype.handleReconnectEdge = function(updatedEdge) {

    var edge = this.graphData.edges.get(updatedEdge.id);
    $tw.utils.extend(edge, updatedEdge);
    
    this.adapter.deleteEdgesFromStore([
      { id: edge.id, label: edge.label }
    ], this.getView());
    
    return this.adapter.insertEdge(edge, this.getView());
    
  };
  
  /**
   * Called by vis when the user tries to delete a node or an edge.
   * 
   * @param {Object} elements - An object containing the elements to be removed.
   * @param {Array<Id>} elements.nodes - Removed edges.
   * @param {Array<Id>} elements.edges - Removed nodes.
   */
  TiddlyMapWidget.prototype.handleRemoveElement = function(elements) {
    
    if(elements.edges.length && !elements.nodes.length) { // only deleting edges
      this.adapter.deleteEdgesFromStore(this.graphData.edges.get(elements.edges), this.getView());
      this.notify("edge" + (elements.edges.length > 1 ? "s" : "") + " removed");
    }
                        
    if(elements.nodes.length) {
      this.handleRemoveNode(this.graphData.nodesById[elements.nodes[0]]);
    }     
  }
  
  TiddlyMapWidget.prototype.handleToggleFullscreen = function() {

    this.logger("log", "Toggle fullscreen");

    if(!this.isFullscreenMode) {
      
      this.logger("log", "Adding fullscreen markers");
      
      var fsMarker = this.opt.misc.cssPrefix + "fullscreen";
      var contextMarker = this.opt.misc.cssPrefix + "has-fullscreen-child";
      
      // first we need to mark the element that we want fullscreen.
      // we cannot set the element itself fullscreen as this would
      // cause modals to be hidden.
      
      var el = document.getElementsByClassName(fsMarker)[0];
      $tw.utils.addClass(this.parentDomNode, fsMarker);
    
      // it's not nice but we need to set a marker to be able to shift
      // the stacking context as the z-index cannot do it on its own
    
      var storyRiver = document.getElementsByClassName("tc-story-river")[0];
      if(this.storyRiver && this.storyRiver.contains(this.parentDomNode)) {
        $tw.utils.addClass(this.storyRiver, contextMarker);
      } else {
        if(this.sidebar && this.sidebar.contains(this.parentDomNode)) {
          $tw.utils.addClass(this.sidebar, contextMarker);
        }
      }
      
      this.isFullscreenMode = true;
      
    }
    
    // toggles(!) fullscreen
    this.dispatchEvent({ type: "tm-full-screen" });
    
  };
    
    
  TiddlyMapWidget.prototype.handleRemoveNode = function(node) {

    var params = {
      "var.nodeLabel": node.label,
      "var.nodeRef": node.ref,
      dialog: {
        preselects: {
          "opt.delete": "from system"
        }
      }
    };

    this.dialogManager.open("deleteNodeDialog", params, function(isConfirmed, outputTObj) {
      
      if(isConfirmed) {
        
        if(outputTObj.fields["opt.delete"] === "from system") {

          // will also delete edges
          this.adapter.deleteNodesFromStore([ node ]);

        } else {
        
          var success = this.getView().removeNodeFromFilter(node);
          
          if(!success) {
            this.notify("Couldn't remove node from filter");
            return;
          }
          
        }
        
        this.notify("Node removed " + outputTObj.fields["opt.delete"]);
        
      }
      
    });
      
  };
  
  TiddlyMapWidget.prototype.handleFullScreenChange = function() {
    
    if(this.isFullscreenMode
       && !document[utils.getFullScreenApis()["_fullscreenElement"]]) {
         
      this.logger("log", "Removing fullscreen markers");

      var fsMarker = this.opt.misc.cssPrefix + "fullscreen";
      var contextMarker = this.opt.misc.cssPrefix + "has-fullscreen-child";
    
      // remove all markers everywhere
      utils.findAndRemoveClassNames([ fsMarker, contextMarker ]);
      
      this.isFullscreenMode = false;
      
    }
    
  };
     
  TiddlyMapWidget.prototype.handleImportTiddlers = function(event) {
    
    var tiddlers = JSON.parse(event.param);
    
    // translate coordinates
    var canvas = this.graphDomNode.getBoundingClientRect();
    var pos = this.network.DOMtoCanvas({
      x: (this.lastImportDropCoordinates.x - canvas.left),
      y: (this.lastImportDropCoordinates.y - canvas.top)
    });
        
    for(var i = 0; i < tiddlers.length; i++) {
      var tObj = this.wiki.getTiddler(tiddlers[i].title);
      
      if(!tObj) {
        this.notify("Cannot integrate foreign tiddler");
        return;
      }
      
      if(utils.isMatch(tObj, this.getView().getNodeFilter("compiled"))) { // no dublicates
        this.notify("Node already exists");
        continue;
      }
      
      var node = this.adapter.createNode(tObj, {
        x: ((i * 20) + pos.x), // if more than one, create some space
        y: pos.y,
      }, this.getView());
      
      if(node) { // only tiddlers that already exist in the wiki
        
        this.getView().addNodeToView(node);
        this.rebuildGraph();
        
      }
    }
    
  };
    
  
  TiddlyMapWidget.prototype.handleStorePositions = function(withNotify) {
    this.adapter.storePositions(this.network.getPositions(), this.getView());
    if(withNotify) {
      this.notify("positions stored");
    }
  };
  
  TiddlyMapWidget.prototype.handleEditNodeFilter = function() {

    var fields = {
      prettyFilter: this.getView().getPrettyNodeFilterExpr()
    };
    
    this.dialogManager.open("editNodeFilter", fields, function(isConfirmed, outputTObj) {
      if(isConfirmed) {
        this.getView().setNodeFilter(utils.getText(outputTObj, fields.prettyFilter));
      }
    });
      
  };

  /**
   * Called by vis when the graph has stabilized itself.
   * 
   * ATTENTION: never store positions in a views map during stabilize
   * as this will affect other graphs positions and will cause recursion!
   * Storing positions inside vis' nodes is fine though
   */
  TiddlyMapWidget.prototype.handleStabilizedEvent = function(properties) {
    
    if(!this.hasNetworkStabilized) {
      this.hasNetworkStabilized = true;
      this.logger("log", "Network stabilized after " + properties.iterations + " iterations");
      this.setNodesMoveable(this.graphData.nodesById,
                            this.getView().isConfEnabled("physics_mode"));
    }
    
  };
  
  TiddlyMapWidget.prototype.fitGraph = function(delay) {
    
    window.clearTimeout(this.activeZoomExtentTimeout);
    
    this.activeZoomExtentTimeout = window.setTimeout(function() {
      this.network.zoomExtent({
        duration: 2000
      });
      this.activeZoomExtentTimeout = 0;
    }.bind(this), delay);
        
  }
  
  TiddlyMapWidget.prototype.handleStartStabilizionEvent = function(properties) {
    
      //~ this.activeZoomExtentTimeout = this.network.zoomExtent({
        //~ duration: 2000
      //~ });

    
  };
  
  /**
   * Allow the given nodes to be moveable.
   * 
   * @param {vis.DataSet} nodes - The nodes for which to allow any
   *     movement (either by physics or by dragging).
   * @param {boolean} isEnabled - True, if the nodes are allowed to
   *     move or be moved.
   */    
  TiddlyMapWidget.prototype.setNodesMoveable = function(nodes, isMoveable) {
    
    this.network.storePositions(); // does it matter if we put this before setter? yes, I guess.

    var updates = [];
    var keys = Object.keys(nodes);
    for(var i = 0; i < keys.length; i++) {
      
      var update = {
        id: nodes[keys[i]].id,
        allowedToMoveX: isMoveable,
        allowedToMoveY: isMoveable
      };
      
      updates.push(update);
      
    }
    
    this.graphData.nodes.update(updates);

  };

  TiddlyMapWidget.prototype.handleInsertNode = function(node) {
    this.dialogManager.open("getNodeName", null, function(isConfirmed, outputTObj) {
      if(isConfirmed) {
        node.label = utils.getText(outputTObj);
        this.adapter.insertNode(node, {
          view: this.getView(),
          editNodeOnCreate: false
        });
        this.preventNextContextReset = true;
      }
    });
  };
    
  /**
   * This handler is registered at and called by the vis network event
   * system
   * 
   * @see
   *   - Coordinates not passed on click/tap events within the properties object
   *     https://github.com/almende/vis/issues/440
   * 
   * @properties a list of nodes and/or edges that correspond to the
   * click event.
   */
  TiddlyMapWidget.prototype.handleDoubleClickEvent = function(properties) {
    
    if(!properties.nodes.length && !properties.edges.length) { // clicked on an empty spot
      
      if(this.editorMode) {
        this.handleInsertNode(properties.pointer.canvas);
      }
      
    } else {
      
      if(this.isFullscreenMode) {
        this.handleToggleFullscreen(); // exit fullsreen
      }
      
      if(properties.nodes.length) { // clicked on a node
         
        var node = this.graphData.nodes.get(properties.nodes[0]);
        this.logger("debug", "Doubleclicked on node", node);        
        this.lastNodeDoubleClicked = node;
        var tRef = node.ref;
                
      } else if(properties.edges.length) { // clicked on an edge
        
        this.logger("debug", "Doubleclicked on an Edge");
        
        // TODO: open option menu
        var edge = this.graphData.edges.get(properties.edges[0]);
        var label = (edge.label
                     ? edge.label
                     : this.opt.misc.unknownEdgeLabel);
        var tRef = this.getView().getEdgeStoreLocation() + "/" + label;
      
      }
      
      // window.location.hash = node.ref; is not the right way to do it
      this.dispatchEvent({
        type: "tm-navigate", navigateTo: tRef
      }); 
            
    }
    
  };
  
  /**
   * Listener will be removed if the parent is not part of the dom anymore
   * 
   * @see
   *   - [TW5] Is there a destructor for widgets?
   *     https://groups.google.com/d/topic/tiddlywikidev/yuQB1KwlKx8/discussion
   *   - https://developer.mozilla.org/en-US/docs/Web/API/Node.contains
   */
  TiddlyMapWidget.prototype.handleResizeEvent = function(event) {
    
    if(this.sidebar.contains(this.parentDomNode)) {
      
      var windowHeight = window.innerHeight;
      var canvasOffset = this.parentDomNode.getBoundingClientRect().top;
      var distanceBottom = this.getAttribute("bottom-spacing", "10px");
      var calculatedHeight = (windowHeight - canvasOffset) + "px";
      
      this.parentDomNode.style["height"] = "calc(" + calculatedHeight + " - " + distanceBottom + ")";
      
    } else {
      
      var height = this.getAttribute("height");
      this.parentDomNode.style["height"] = (height ? height : "300px");
      
    }

    if(this.network) {
      this.repaintGraph(); // redraw graph
    }
    
  };
  
  /**
   * called from outside.
   */
  TiddlyMapWidget.prototype.destruct = function() {
    window.removeEventListener("resize", this.handleResizeEvent);
    this.network.destroy();
  };
  
  /**
   * used to prevent nasty deletion as edges are not unselected when leaving vis
   */
  TiddlyMapWidget.prototype.handleClickEvent = function(event) {

    if(!document.body.contains(this.parentDomNode)) {
      window.removeEventListener("click", this.handleClickEvent);
      return;
    }
    
    if(this.network) {
      var element = document.elementFromPoint(event.clientX, event.clientY);
      if(!this.parentDomNode.contains(element)) {
        this.network.selectNodes([]);
      }
    }

  };
  
  /**
   * Called by vis when the dragging of a node(s) has ended.
   * @param {Object} properties - A vis object containing event-related
   *     information.
   * @param {Array<Id>} properties.nodeIds - Array of ids of the nodes
   *     that were being dragged.
   */
  TiddlyMapWidget.prototype.handleNodeDragEnd = function(properties) {
    if(properties.nodeIds.length
       && this.getView().getConfig("layout.active") !== "hierarchical") {
      var isFloatingMode = this.getView().isConfEnabled("physics_mode");
      
      var node = this.graphData.nodesById[properties.nodeIds[0]];
      this.setNodesMoveable([ node ], isFloatingMode);
      if(!isFloatingMode) { // only store positions if in floating mode
        this.handleStorePositions();
      }
    }
  };
  
  /**
   * Called by vis when a node is being dragged.
   * @param {Object} properties - A vis object containing event-related
   *     information.
   * @param {Array<Id>} properties.nodeIds - Array of ids of the nodes
   *     that are being dragged.
   */
  TiddlyMapWidget.prototype.handleNodeDragStart = function(properties) {
    if(properties.nodeIds.length) {
      var node = this.graphData.nodesById[properties.nodeIds[0]];
      this.setNodesMoveable([ node ], true);
    }
  };
   
  /**
   * The view holder is a tiddler that stores a references to the current
   * view. If the graph is not bound to a view by the user via an
   * attribute, the default view holder is used. Otherwise, a temporary
   * holder is created whose value is set to the view specified by the user.
   * This way, the graph is independent from view changes made in a
   * tiddlymap editor.
   * 
   * This function will only calculate a new reference to the holder
   * on first call (that is when no view holder is registered to "this".
   * 
   */
  TiddlyMapWidget.prototype.getViewHolderRef = function() {
    
    // the viewholder is never recalculated once it exists
    if(this.viewHolderRef) {
      return this.viewHolderRef;
    }
    
    this.logger("info", "Retrieving or generating the view holder reference");
    
    // if given, try to retrieve the viewHolderRef by specified attribute
    var viewName = this.getAttribute("view");
    if(viewName) {
      
      this.logger("log", "User wants to bind view \"" + viewName + "\" to graph");
            
      var viewRef = this.opt.path.views + "/" + viewName;
      if(this.wiki.getTiddler(viewRef)) {
        
        // create a view holder that is exclusive for this graph
        
        var holderRef = this.opt.path.localHolders + "/" + utils.genUUID();
        this.logger("log", "Created an independent temporary view holder \"" + holderRef + "\"");
        
        // we do not use setView here because it would store and reload the view unnecessarily...
        this.wiki.addTiddler(new $tw.Tiddler({ 
          title: holderRef,
          text: viewRef
        }));
        
        this.logger("log", "View \"" + viewRef + "\" inserted into independend holder");
        
      } else {
        this.logger("log", "View \"" + viewName + "\" does not exist");
      }
      
    }
    
    if(typeof holderRef === "undefined") {
      this.logger("log", "Using default (global) view holder");
      var holderRef =  this.opt.ref.defaultGraphViewHolder;
    }
    
    return holderRef;
    
  };
  
  /**
   * This function will switch the current view reference of the
   * view holder. If no viewRef is specified, the current view is
   * simply updated.
   * 
   * @viewRef (optional) a reference (tiddler title) to a view
   * @viewHolderRef (optional) a reference to the view holder that should be updated
   */
  TiddlyMapWidget.prototype.setView = function(viewRef, viewHolderRef) {
    
    if(viewRef) {
      if(!viewHolderRef) {
        viewHolderRef = this.viewHolderRef;
      }
      this.logger("info", "Inserting view \"" + viewRef + "\" into holder \"" + viewHolderRef + "\"");
      this.wiki.addTiddler(new $tw.Tiddler({ 
        title : viewHolderRef,
        text : viewRef
      }));
    }
    
    // register the new value; no need to update the adapter as this is done during refresh
    this.view = this.getView(true);
  };
  
  /**
   * This function will return a view abstraction that is based on the
   * view specified in the view holder of this graph.
   * 
   * @param {boolean} isRebuild - Retrieve the view reference again
   *     from the holder and recreate the view abstraction object.
   * @return {ViewAbstraction} the view
   */
  TiddlyMapWidget.prototype.getView = function(isRebuild) {
    
    if(!isRebuild && this.view) {
      return this.view;
    }
    
    var viewHolderRef = this.getViewHolderRef();
    var curViewRef = this.wiki.getTiddler(viewHolderRef).fields.text;
    this.logger("info", "Retrieved view \"" + curViewRef + "\" from holder \"" + viewHolderRef + "\"");
    
    if(utils.tiddlerExists(curViewRef)) {
      return new ViewAbstraction(curViewRef);
    } else {
      this.logger("log", "Warning: View \"" + curViewRef + "\" doesn't exist. Default is used instead.");
      return new ViewAbstraction("default");
    }
    
  };
    
  TiddlyMapWidget.prototype.repaintGraph = function() {
    
    if(!document[utils.getFullScreenApis()["_fullscreenElement"]]
       || this.isFullscreenMode) {
    
      this.logger("info", "Repainting the whole graph");
    
      this.network.redraw();
      this.network.zoomExtent();
      
    }
    
  };
    
  /**
   * If a button is enabled it means it is displayed on the graph canvas.
   * 
   * @param {string} name - The name of the button to enabled. Has to
   *     correspond with the css button name.
   * @param {boolean} enable - True if the button should be visible,
   *     false otherwise.
   */ 
  TiddlyMapWidget.prototype.setGraphButtonEnabled = function(name, enable) {
    var className = "network-navigation tiddlymap-button " + name;
    var b = this.parentDomNode.getElementsByClassName(className)[0];
    $tw.utils.toggleClass(b, "enabled", enable);
  }; 

  /**
   * This function will create the dom elements for all tiddlymap-vis
   * buttons and register the event listeners.
   * 
   * @param {Object<string, function>} buttonEvents - The label of the
   *     button that is used as css class and the click handler.
   */
  TiddlyMapWidget.prototype.addGraphButtons = function(buttonEvents) {
    
    var parent = this.parentDomNode.getElementsByClassName("vis network-frame")[0];
    
    for(var name in buttonEvents) {
      var div = document.createElement("div");
      div.className = "network-navigation tiddlymap-button " + name;
      div.addEventListener("click", buttonEvents[name].bind(this), false);
      parent.appendChild(div);
    }
    
  };
  
  // !! EXPORT !!
  exports.tiddlymap = TiddlyMapWidget;
  // !! EXPORT !!
  
})();


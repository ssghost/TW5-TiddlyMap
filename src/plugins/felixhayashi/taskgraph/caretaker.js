/*\

title: $:/plugins/felixhayashi/taskgraph/caretaker.js
type: application/javascript
module-type: startup

This module is responsible for registering a global namespace under $tw
and loading (and refreshing) the configuration.

Since changes in configuration tiddlers are instantly acknowledged,
the user does not need to refresh its browser (in theory :)).

Like a caretaker in real life, nobody can communicate with him. He does
all his work in the background without being ever seen. What I want to
say here is: do not require the caretaker!

@preserve

\*/

(function(){
  
  /*jslint node: true, browser: true */
  /*global $tw: false */
  "use strict";
  
  // Export name and synchronous status
  exports.name = "taskgraph-setup";
  exports.after = ["startup"];
  exports.before = ["rootwidget"];
  exports.synchronous = true;
  
  /**************************** IMPORTS ****************************/
   
  var utils = require("$:/plugins/felixhayashi/taskgraph/utils.js").utils;
  var Adapter = require("$:/plugins/felixhayashi/taskgraph/adapter.js").Adapter;
  
  /***************************** CODE ******************************/

  
  /**
   * This function will append the global options to the tree. In case
   * this function is called again, only the option leafs are rebuild
   * so a process may safely store a reference to a branch of the option
   * tree as the reference doesn't change.
   *
   * ATTENTION: For the path options, no trailing or double slashes!
   * This is NOT unix where paths are normalized (// is not rewritten to /).
   * 
   * @see 
   *   - [TW5] Is there a designated place for TW plugins to store stuff in the dom? 
   *     https://groups.google.com/forum/#!topic/tiddlywikidev/MZZ37XiVcvY
   * @param {object} parent The root where to insert the options into
   */  
  var attachOptions = function(parent) {
                      
    var opt = parent;
    
    // **ATTENTION: NO TRAILING SLASHES IN PATHS EVER**
    if(!opt.path) opt.path = utils.getEmptyMap();
    
    // persistent plugin environment
    opt.path.pluginRoot =   "$:/plugins/felixhayashi/taskgraph";
    opt.path.edges =        "$:/plugins/felixhayashi/taskgraph/graph/edges";
    opt.path.views =        "$:/plugins/felixhayashi/taskgraph/graph/views";
    opt.path.options =      "$:/plugins/felixhayashi/taskgraph/options";
    // temporary environment
    opt.path.tempRoot =     "$:/temp/felixhayashi/taskgraph";
    opt.path.localHolders = "$:/temp/felixhayashi/taskgraph/holders";
    opt.path.dialogs =      "$:/temp/felixhayashi/taskgraph/dialog";
    
    // static references to important tiddlers
    if(!opt.ref) opt.ref = utils.getEmptyMap();
    
    opt.ref.dialogStandardFooter =   "$:/plugins/felixhayashi/taskgraph/dialog/standardFooter";
    opt.ref.visOptions =             "$:/plugins/felixhayashi/taskgraph/options/vis";
    opt.ref.tgOptions =              "$:/plugins/felixhayashi/taskgraph/options/taskgraph";
    opt.ref.edgeTypeDialog =         "$:/plugins/felixhayashi/taskgraph/dialog/getEdgeType";
    opt.ref.viewNameDialog =         "$:/plugins/felixhayashi/taskgraph/dialog/getViewName";
    opt.ref.confirmationDialog =     "$:/plugins/felixhayashi/taskgraph/dialog/getConfirmation";
    opt.ref.nodeNameDialog =         "$:/plugins/felixhayashi/taskgraph/dialog/getNodeName";
    opt.ref.editNodeFilter =         "$:/plugins/felixhayashi/taskgraph/dialog/editNodeFilter";
    opt.ref.cannotDeleteViewDialog = "$:/plugins/felixhayashi/taskgraph/dialog/cannotDeleteViewDialog";
    opt.ref.defaultGraphViewHolder = "$:/plugins/felixhayashi/taskgraph/misc/defaultViewHolder";
    opt.ref.graphBar =               "$:/plugins/felixhayashi/taskgraph/misc/advancedEditorBar";
    
    // original user options from the option tiddlers
    opt.user = $tw.wiki.getTiddlerData(opt.ref.tgOptions, utils.getEmptyMap());
    opt.user.vis = $tw.wiki.getTiddlerData(opt.ref.visOptions, utils.getEmptyMap());
    
    // fields with special meanings
    if(!opt.field) opt.field = utils.getEmptyMap();
    
    // used to identify a tiddler being a view that visbile to the user.
    // if a view tiddler is not tagged with this marker, it can still be used
    // as view but won't show up 
    opt.field.viewMarker = "isview";
    opt.field.nodeId = (opt.user.field_nodeId ? opt.user.field_nodeId : "id");

    // some other options
    if(!opt.misc) opt.misc = utils.getEmptyMap();
    
    // if no edge label is specified, this is used as label
    opt.misc.unknownEdgeLabel = "(!noname!)";

    // some popular filters (usually used from within tiddlers via tgmacro)
    if(!opt.filter) opt.filter = utils.getEmptyMap();
    
    opt.filter.allSharedEdges = "[prefix[" + opt.path.edges + "]]";
    opt.filter.allSharedEdgesByLabel = "[prefix[" + opt.path.edges + "]removeprefix[" + opt.path.edges + "/]]";
    opt.filter.allViews = "[all[tiddlers+shadows]has[" + opt.field.viewMarker + "]]";
    opt.filter.allViewsByLabel = "[all[tiddlers+shadows]has[" + opt.field.viewMarker + "]removeprefix[" + opt.path.views + "/]]";
    
  };
  
  /**
   * This function attaches all the top level functions to the options to the 
   */
  var attachFunctions = function(parent) {
    
    var fn = parent;
    
    var nirvana = function() { /* /dev/null */ }; 

    if($tw.taskgraph.opt.user.debug === true && console) {
    
      // http://stackoverflow.com/questions/5538972/console-log-apply-not-working-in-ie9
      // http://stackoverflow.com/questions/9521921/why-does-console-log-apply-throw-an-illegal-invocation-error
      /**
       * A logging mechanism that uses the first argument as type and
       * passes all consequent arguments as console arguments. The
       * reason for this functions existence is to be able to switch
       * off the logging without redirecting every single console function
       * such as log, debug, warn etc. Plus, we have more control over
       * the logging.
       */
      fn.logger = function() {
        if(arguments.length < 2) return;
        var args = Array.prototype.slice.call(arguments);
        var arg1 = args.shift(args);
        var type = (console.hasOwnProperty(arg1) ? arg1 : "debug");
        console[type].apply(console, args);
      };
      
    } else { fn.logger = nirvana }

    fn.notify = ($tw.taskgraph.opt.user.notifications ? utils.notify : nirvana);
    
    return fn;
    
  };
  
  var getChangeFilter = function() {
    
    var filter = (function() {
      var filterComponents = [];
      filterComponents.push("prefix[" + $tw.taskgraph.opt.path.options + "]");
      filterComponents.push("!has[draft.of]");
      return "[" + filterComponents.join('') + "]";
    }).call(this);
    
    $tw.taskgraph.logger("log", "Caretaker's filter: \"" + filter + "\"");
    
    return $tw.wiki.compileFilter(filter);

  };

  exports.startup = function() {
    
    // create namespaces
    $tw.taskgraph = utils.getEmptyMap();
    
    // build and integrate global options
    $tw.taskgraph.opt = utils.getEmptyMap();
    attachOptions($tw.taskgraph.opt);
    
    // build and integrate functions that depend on the options
    attachFunctions($tw.taskgraph, $tw.taskgraph.opt);
    
    
    // attach the adapter
    $tw.taskgraph.adapter = new Adapter();
    
    $tw.taskgraph.logger("warn", "Taskgraph's caretaker was started");
    $tw.taskgraph.logger("log", "Registered namespace and options");
    
    // Create an array to insert edge changes.
    //
    // This may need a more thoroughly explanation:
    // Tiddler changes are propagated to each graph via the refresh
    // mechanism. Thus, a graph may update its nodes by checking during
    // widget.refresh() if a node got added, updated or removed.
    // However, because edges do not correspond to tiddlers, a graph
    // can only be aware of edgestore changes during refresh. However,
    // calculating the delta between an edgestore's former and current
    // state to reflect the changes in the graph is way too cumbersome.
    // therefore, each adapter.insertEdge() operation registers any change
    // at this global object. Once a graphs refresh() sees an edgestore
    // has changed, it looks here to trace the latest changes.
    //
    // Each registered change is an object has two properties
    // 1) "type" which is either "insert", "update" or "delete"
    // 2) "edge" which is a copy of the edge object this update is concerned with
    //
    $tw.taskgraph.edgeChanges = [];
    
    var filter = getChangeFilter();
    
    $tw.wiki.addEventListener("change", function(changedTiddlers) {
      
      $tw.taskgraph.logger("warn", "These tiddlers changed:", changedTiddlers);
      
      var matches = utils.getMatches(filter, Object.keys(changedTiddlers));
      if(!matches.length) return;
      
      $tw.taskgraph.logger("warn", "Global options will be rebuild");
      
      // rebuild
      attachOptions($tw.taskgraph);
      attachFunctions($tw.taskgraph);
      
    });
        
  };

})();

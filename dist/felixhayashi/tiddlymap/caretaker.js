/*\

title: $:/plugins/felixhayashi/tiddlymap/caretaker.js
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
(function(){"use strict";exports.name="tiddlymap-setup";exports.platforms=["browser"];exports.after=["startup"];exports.before=["rootwidget"];exports.synchronous=true;var e=require("$:/plugins/felixhayashi/tiddlymap/utils.js").utils;var t=require("$:/plugins/felixhayashi/tiddlymap/adapter.js").Adapter;var i=function(t){var i=t;if(!i.path)i.path=e.getEmptyMap();i.path.pluginRoot="$:/plugins/felixhayashi/tiddlymap";i.path.edges="$:/plugins/felixhayashi/tiddlymap/graph/edges";i.path.views="$:/plugins/felixhayashi/tiddlymap/graph/views";i.path.options="$:/plugins/felixhayashi/tiddlymap/options";i.path.tempRoot="$:/temp/felixhayashi/tiddlymap";i.path.localHolders="$:/temp/felixhayashi/tiddlymap/holders";i.path.dialogs="$:/plugins/felixhayashi/tiddlymap/dialog";if(!i.ref)i.ref=e.getEmptyMap();i.ref.dialogStandardFooter="$:/plugins/felixhayashi/tiddlymap/dialog/standardFooter";i.ref.visOptions="$:/plugins/felixhayashi/tiddlymap/options/vis";i.ref.tgOptions="$:/plugins/felixhayashi/tiddlymap/options/tiddlymap";i.ref.defaultGraphViewHolder="$:/plugins/felixhayashi/tiddlymap/misc/defaultViewHolder";i.ref.graphBar="$:/plugins/felixhayashi/tiddlymap/misc/advancedEditorBar";i.user=$tw.wiki.getTiddlerData(i.ref.tgOptions,e.getEmptyMap());i.user.vis=$tw.wiki.getTiddlerData(i.ref.visOptions,e.getEmptyMap());if(!i.field)i.field=e.getEmptyMap();i.field.viewMarker="isview";i.field.nodeId=i.user.field_nodeId?i.user.field_nodeId:"id";i.field.nodeLabel=i.user.field_nodeLabel?i.user.field_nodeLabel:"title";if(!i.misc)i.misc=e.getEmptyMap();i.misc.unknownEdgeLabel="__noname__";i.misc.cssPrefix="tmap-";if(!i.filter)i.filter=e.getEmptyMap();i.filter.allSharedEdges="[prefix["+i.path.edges+"]]";i.filter.allSharedEdgesByLabel="[prefix["+i.path.edges+"]removeprefix["+i.path.edges+"/]]";i.filter.allViews="[all[tiddlers+shadows]has["+i.field.viewMarker+"]]";i.filter.allViewsByLabel="[all[tiddlers+shadows]has["+i.field.viewMarker+"]removeprefix["+i.path.views+"/]]"};var a=function(t){var i=t;var a=function(){};if($tw.tiddlymap.opt.user.debug===true&&console){i.logger=function(){if(arguments.length<2)return;var e=Array.prototype.slice.call(arguments);var t=e.shift(e);var i=console.hasOwnProperty(t)?t:"debug";console[i].apply(console,e)}}else{i.logger=a}i.notify=$tw.tiddlymap.opt.user.notifications?e.notify:a;return i};var d=function(){var e=function(){var e=[];e.push("prefix["+$tw.tiddlymap.opt.path.options+"]");e.push("!has[draft.of]");return"["+e.join("")+"]"}.call(this);$tw.tiddlymap.logger("log","Caretaker's filter: \""+e+'"');return $tw.wiki.compileFilter(e)};var l=function(){for(var e=$tw.tiddlymap.registry.length-1;e>=0;e--){var t=$tw.tiddlymap.registry[e];if(!document.body.contains(t.getContainer())){$tw.tiddlymap.logger("warn","A graph has been removed.");t.destruct();$tw.tiddlymap.registry.splice(e,1)}}};exports.startup=function(){$tw.tiddlymap=e.getEmptyMap();$tw.tiddlymap.registry=[];window.setInterval(l,1e3);$tw.tiddlymap.opt=e.getEmptyMap();i($tw.tiddlymap.opt);a($tw.tiddlymap,$tw.tiddlymap.opt);$tw.tiddlymap.adapter=new t;$tw.tiddlymap.logger("warn","TiddlyMap's caretaker was started");$tw.tiddlymap.logger("log","Registered namespace and options");$tw.tiddlymap.edgeChanges=[];var r=d();$tw.wiki.addEventListener("change",function(t){$tw.tiddlymap.logger("warn","These tiddlers changed:",t);var d=e.getMatches(r,Object.keys(t));if(!d.length)return;$tw.tiddlymap.logger("warn","Global options will be rebuild");i($tw.tiddlymap);a($tw.tiddlymap)})}})();
'use strict';
/**
 * @memberof CollaborativeMap
 *
 * @fileOverview Wrapper for all leaflet based map interactions.
 * Used to keep leaflet specific code out of other modules.
 *
 * @exports CollaborativeMap.MapHandler
 * @requires  Utils
 * @requires  Socket
 * @author Dennis Wilhelm
 */
angular.module('CollaborativeMap')
  .service('MapHandler', ['Utils', 'Socket',
    function(Utils, Socket) {

      var map, drawnItems, mapScope, drawControl;
      var editHandler, editFeatureId;

      return {

        /**
         * Initialize the service.
         * Patches the Leaflet LStamp Function to get more unique ids.
         * @param  {Object} m     the map
         * @param  {Object} dI    drawnItems (layer group for the features)
         * @param  {Object} scope Angular scope
         * @param  {Object} dControl the drawControl of leaflet.draw
         */
        initMapHandler: function(m, dI, scope, dControl) {
          //patch L.stamp to get unique layer ids
          Utils.patchLStamp();

          map = m;
          drawnItems = dI;
          mapScope = scope;
          drawControl = dControl;

          map.on('draw:drawstart', function() {
            if (editHandler) {
              this.removeEditHandler();
            }
          }.bind(this));

          /* Cancels the editing if the mouse still moves while ending a drag operation
          m.on('click', function() {
            if (editHandler) {
              this.revertEditedFeature();
            }
          }.bind(this));
          */
        },

        /**
         * Called to start editing a feature with leaflet.draw manually.
         * @param {Object} layer the leaflet layer
         */
        editFeature: function(layer) {
          //If a feature is already in editing mode, stop before creating a new editHandler
          if (editHandler) {
            this.removeEditHandler();
            editFeatureId = undefined;
          }

          var editPathOptions = {
            color: '#fe57a1',
            /* Hot pink all the things! */
            opacity: 0.6,
            dashArray: '10, 10',

            fill: true,
            fillColor: '#fe57a1',
            fillOpacity: 0.1,

            // Whether to user the existing layers color
            maintainColor: false
          };

          editHandler = new L.EditToolbar.Edit(map, {
            featureGroup: L.featureGroup([layer]),
            selectedPathOptions: editPathOptions
          });

          //jshint camelcase:false
          editFeatureId = layer._leaflet_id;
          editHandler.enable();
          mapScope.$emit('editHandler', true);

          layer.on('dragend', function() {
            editHandler.save();
          });
          layer.on('edit', function() {
            editHandler.save();
          });
        },

        /**
         * Save the changes made via the leaflet.draw edit
         */
        saveEditedFeature: function() {
          if (editHandler) {
            editHandler.save();
            this.removeEditHandler();
          }
        },

        /**
         * Remove an existing editHandler and cancel the edit mode.
         */
        removeEditHandler: function() {
          if (editHandler) {
            editHandler.disable();
            editHandler = undefined;
            mapScope.$emit('editHandler', false);
          }
        },

        /**
         * Deletes the currently selected feature
         */
        deleteFeature: function() {
          if (editHandler) {
            editHandler.disable();
          }
          var delLayer = map._layers[editFeatureId];
          var deleteHandler = new L.EditToolbar.Delete(map, {
            featureGroup: L.featureGroup([delLayer]),
          });
          deleteHandler.enable();
          deleteHandler._removeLayer(delLayer);
          deleteHandler.save();
          deleteHandler.disable();
          this.removeLayer(map, {
            fid: editFeatureId
          }, drawnItems);

        },


        /**
         * Updates a feature by removing the layer and redrawing the feature.
         * Fires a 'propertyEdited' event.
         * @param  {Object} layer leaflet layer
         */
        updateFeature: function(layer) {
          this.removeLayer(map, layer, drawnItems);
          this.addGeoJSONFeature(map, layer, drawnItems);
          map.fireEvent('propertyEdited', {
            'layer': layer.feature,
            'fid': layer.fid
          });
        },

        updateOnlyProperties: function(layer) {
          if (editFeatureId) {
            var tmpLayer = map._layers[editFeatureId].toGeoJSON();
            layer.feature.geometry = tmpLayer.geometry;
          }
          this.updateFeature(layer);
        },


        disableClick: false,

        /**
         * Adds a click event to a layer.
         * Select a feature on click and highlight it's geometry.
         * @param {Object} layer leaflet layer
         */
        addClickEvent: function(layer) {
          layer.on('click', function() {
            if (!this.disableClick) {
              mapScope.selectFeature(layer);
              this.editFeature(layer);
            }
          }.bind(this));
        },

        /**
         * Disable the default click event and return the
         */
        getLayerIdOnce: function(cb) {
          //jshint camelcase:false
          this.disableClick = true;
          drawnItems.once('click', function(layer) {
            if (this.disableClick) {
              this.disableClick = false;
              var fid;
              if (layer && layer.layer && layer.layer._leaflet_id) {
                fid = layer.layer._leaflet_id;
              }
              cb(fid);
            }else{
              cb('');
            }
          }.bind(this));
        },


        /**
         * Fits the map to a given bounding box
         * @param  {Object} bounds leaflet bouding box (L.LatLngBounds)
         */
        fitBounds: function(bounds) {
          map.fitBounds(bounds);
        },

        /**
         * Creates a Leaflet bounding box (L.LatLngBounds)
         * @param  {Array} nE [lat,lng]
         * @param  {Array} sW [lat, lng]
         * @return {Object}    leafet bounding box (L.LatLngBounds)
         */
        getBounds: function(nE, sW) {
          return new L.LatLngBounds(nE, sW);
        },

        /**
         * Draws a rectangle with a users bounding box on the map.
         * Removes the layer after 3000ms.
         * Zooms to the rectangle
         * @param  {Object} bounds Leaflet bounding box (L.LatLngBounds)
         */
        paintUserBounds: function(bounds) {
          var bound = L.rectangle(bounds, {
            color: '#ff0000',
            weight: 1,
            fill: false
          });
          bound.addTo(map);
          map.fitBounds(bound, {
            'padding': [5, 5]
          });
          setTimeout(function() {
            map.removeLayer(bound);
          }, 3000);
        },

        /**
         * Sends the event to revert a feature via Websockets
         * @param  {String} mapId the map id
         * @param  {String} fid   feature id
         * @param  {String} toRev revision to which the feature should be reverted
         * @param  {String} user  username
         */
        revertFeature: function(mapId, fid, toRev, user) {
          Socket.emit('revertFeature', {
            'mapId': mapId,
            'fid': fid,
            'toRev': toRev,
            'user': user
          }, function(res) {
            console.log(res);
          });
        },

        /**
         * Sends the event to restore a deleted feature via Websockets
         * @param  {String} mapId the map id
         * @param  {String} fid   feature id
         * @param  {Object} feature leaflet feature
         * @param  {String} user  username
         */
        restoreDeletedFeature: function(mapId, fid, feature, user) {
          Socket.emit('restoreDeletedFeature', {
            'mapId': mapId,
            'fid': fid,
            'feature': feature,
            'action': 'restored',
            'user': user
          }, function(res) {
            console.log(res);
          });
        },


        /**
         * Zoom/Pan to feature with a given ID
         * @param  {String} id feature id (= layer id)
         */
        panToFeature: function(id) {
          var target = map._layers[id];

          if (target && target._latlng) {
            map.panTo(target._latlng);
          } else if (target && target._latlngs) {
            var bounds = target.getBounds();
            map.fitBounds(bounds);
          }
        },

        /**
         * Creates Leaflet geojson layers with the Mapbox SimpleStyle specification
         * @param  {Object} geojson feature
         * @return {Object} leaflet layer
         */
        createSimpleStyleGeoJSONFeature: function(geoJsonFeature) {
          return L.geoJson(geoJsonFeature, {
            style: L.mapbox.simplestyle.style,
            pointToLayer: function(feature, latlon) {
              if (!feature.properties) {
                feature.properties = {};
              }
              return L.mapbox.marker.style(feature, latlon);
            }
          });
        },

        /**
         * Adds GeoJSON encoded features to the map
         * @param {Object} map
         * @param {Object} event = {feature, fid //feature id}
         * @param {Object} drawnItems = layer group
         */
        addGeoJSONFeature: function(map, event, drawnItems) {
          //jshint camelcase:false
          var newLayer = this.createSimpleStyleGeoJSONFeature(event.feature);
          var tmpLayer;
          for (var key in newLayer._layers) {
            tmpLayer = newLayer._layers[key];
            tmpLayer._leaflet_id = event.fid;
            this.addClickEvent(tmpLayer);
            tmpLayer.addTo(drawnItems);
            //If action is available (edit, create, delete) highight the feature
            if (event.action) {
              this.highlightFeature(tmpLayer);
            }
          }
        },

        /**
         * Highlights a feature for a few seconds (differentation between svgs and html elements)
         * @param  {Object} feature leaflet feature
         */
        highlightFeature: function(feature) {
          if (feature) {
            var elem = feature._icon || feature._container.children[0];
            var tmpClass = elem.getAttribute('class');
            if (tmpClass.indexOf('highlight') === -1) {
              elem.setAttribute('class', tmpClass + 'animateAll');
              setTimeout(function() {
                elem.setAttribute('class', tmpClass + ' highlight');
              }, 50);

              setTimeout(function() {
                elem.setAttribute('class', tmpClass + ' animateAll');
                setTimeout(function() {
                  elem.setAttribute('class', tmpClass);
                }, 1000);
              }, 1000);
            }
          }
        },

        /**
         * Wrapper for the highlightFeature function to highlight a feature with the feature id as parameter instead of the layer.
         * @param  {String} fid feature id
         */
        highlightFeatureId: function(fid) {
          this.highlightFeature(map._layers[fid]);
        },

        /**
         * Removes a layer from the map.
         * @param  {Object} map        the map
         * @param  {Object} event      remove event ({fid, feature, user})
         * @param  {Object} drawnItems layer group for the features
         */
        removeLayer: function(map, event, drawnItems) {
          var deleteLayer = map._layers[event.fid];
          if (deleteLayer) {
            map.removeLayer(deleteLayer);
            drawnItems.removeLayer(deleteLayer);
          }
        },

        /**
         * Check if the selected feature has been edited
         * @return {Boolean} is edited
         */
        hasGeometryEdits: function() {
          if (editHandler && editHandler._featureGroup && editHandler._featureGroup._layers) {
            var layers = editHandler._featureGroup._layers;
            for (var key in layers) {
              if (layers[key].edited === true) {
                return true;
              }
            }
            return false;
          } else {
            return false;
          }
        },

        /**
         * Return the osm geometry type of a given layer
         * @param  {Object} layer leaflet layer
         * @return {String}       geometry type (point, area, line)
         */
        getLayerType: function(layer) {
          if (layer instanceof L.Marker) {
            return 'point';
          } else if (layer instanceof L.Polygon) {
            return 'area';
          } else if (layer instanceof L.Polyline) {
            return 'line';
          }
        },

        /**
         * Return the osm geometry type of a layer based on the feature id
         * @param  {String} fid feature id
         * @return {String}     geometry type
         */
        getLayerTypeFid: function(fid) {
          var layer = map._layers[fid];
          if (layer) {
            return this.getLayerType(layer);
          }
        }

      };
    }
  ]);

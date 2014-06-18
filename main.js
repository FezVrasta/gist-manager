/*global define, brackets, $, Mustache */

define(function (require, exports, module) {
    "use strict";

    var panel                   = require("text!templates/panel.html"),
        panelError              = require("text!templates/panelError.html"),
        gist                    = require("text!templates/gist.html");

    var CommandManager          = brackets.getModule("command/CommandManager"),
        EditorManager           = brackets.getModule("editor/EditorManager"),
        ExtensionUtils          = brackets.getModule("utils/ExtensionUtils"),
        Menus                   = brackets.getModule("command/Menus"),
        PanelManager            = brackets.getModule("view/PanelManager");

    var $panel                  = $(),
        $panelError             = $(),
        gists                   = null;

    var TOGGLE_PANEL = "gist-manager.run";

    function _handlePanelToggle() {
        $panel = $("#gist-manager");

        if ($panel.is(":visible")) {
            $panel.hide();
            CommandManager.get(TOGGLE_PANEL).setChecked(false);
            EditorManager.focusEditor();
        } else {
            $panel.show();
            CommandManager.get(TOGGLE_PANEL).setChecked(true);
        }
        EditorManager.resizeEditor();
    }

    CommandManager.register("Show Gist Manager", TOGGLE_PANEL, _handlePanelToggle);

    function renderGist(gistData) {

        $panel = $("#gist-manager");

        if (!$panel.find("#" + gistData.id).data("loaded")) {

            $.getJSON(gistData.url, function(gistData) {

                gistData.files = $.map(gistData.files, function(value) {
                    return [value];
                });

                var $gist = $(Mustache.render(gist, gistData));
                $panel.find("#" + gistData.id).html($gist).data("loaded", true);

            });

        }

        $panel
        .find(".gist").hide().end()
        .find("a").removeClass("active").end()
        .find("a[href=#" + gistData.id + "]").addClass("active").end()
        .find("#" + gistData.id).show();

    }

    function init() {

        ExtensionUtils.loadStyleSheet(module, "styles/gist-manager.css");

        var menu = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU);
        menu.addMenuItem(TOGGLE_PANEL, null, Menus.AFTER);

        var $panel;
        $.getJSON("https://api.github.com/users/FezVrasta/gists", function(data) {
            gists = data;

            $panel = $(Mustache.render(panel, {"gists": gists}));

            PanelManager.createBottomPanel("fezvrasta.gist-manager.panel", $panel, 200);

            // Render the first gist
            renderGist(gists[0]);

            $panel
                .on("click", ".close", function() { CommandManager.execute(TOGGLE_PANEL); })
                .on("click", ".list-group-item", function(event) {
                    console.log(gists);

                    gists.forEach( function(gist) {
                        if (gist.id == $(event.target).data("id")) {
                            renderGist(gist);
                            console.log(gist);
                            return;
                        }
                    });

                });

        }).error( function() {

            $panelError = $(Mustache.render(panelError));
            PanelManager.createBottomPanel("fezvrasta.gist-manager.panel", $panelError, 200);

        });

    }

    init();

});

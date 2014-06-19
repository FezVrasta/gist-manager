/*global define, brackets, $, Mustache, btoa */

define(function (require, exports, module) {
    "use strict";

    var panel                   = require("text!templates/panel.html"),
        contentError              = require("text!templates/contentError.html"),
        content                 = require("text!templates/content.html"),
        gist                    = require("text!templates/gist.html");

    var CommandManager          = brackets.getModule("command/CommandManager"),
        EditorManager           = brackets.getModule("editor/EditorManager"),
        ExtensionUtils          = brackets.getModule("utils/ExtensionUtils"),
        Menus                   = brackets.getModule("command/Menus"),
        PanelManager            = brackets.getModule("view/PanelManager");

    var Strings                 = require("strings");

    var $panel                  = $(),
        $content                = $(),
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

    function loadContent(username, password) {

        if (password.length) { // If a password is defined, then try to login and get secret gists beside the public ones

            $.ajax
            ({
                type: "GET",
                url: "https://api.github.com/gists",
                dataType: "json",
                async: false,
                headers: {
                    "Authorization": "Basic " + btoa(username + ":" + password)
                },
                success: function (data) {
                    gists = data;
                    _renderContent(gists);
                },
                error: function () {
                    _renderContent([]);
                }
            });

        } else { // If password is not defined, get just the public gists of the selected user

            $.getJSON("https://api.github.com/users/" + username + "/gists", function(data) {
                gists = data;
                _renderContent(gists);
            })
            .error( function() {
                _renderContent([]);
            });

        }

        function _renderContent(gists) {

            if (gists.length > 0) {
                $content = $(Mustache.render(content, {"gists": gists}));
            } else {
                $content = $(Mustache.render(contentError, Strings));
            }

            $panel.find(".gist-manager-content").html($content);

            // Render the first gist
            renderGist(gists[0]);

            $panel
            .on("click", ".close", function() { CommandManager.execute(TOGGLE_PANEL); })
            .on("click", ".list-group-item", function(event) {

                gists.forEach( function(gist) {
                    if (gist.id == $(event.target).data("id")) {
                        renderGist(gist);
                        return;
                    }
                });

            });
        }
    }

    function init() {

        ExtensionUtils.loadStyleSheet(module, "styles/gist-manager.css");

        var menu = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU);
        menu.addMenuItem(TOGGLE_PANEL, null, Menus.AFTER);

        $panel = $(Mustache.render(panel, Strings));
        PanelManager.createBottomPanel("fezvrasta.gist-manager.panel", $panel, 200);

        $panel.on("click", "#load-gists", function() {
            loadContent($panel.find("#github-username").val(), $panel.find("#github-password").val());
        });

    }

    init();

});

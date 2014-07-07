/*global define, brackets, $, Mustache, btoa */

define(function (require, exports, module) {
    "use strict";

    var panel                   = require("text!templates/panel.html"),
        content                 = require("text!templates/content.html"),
        gist                    = require("text!templates/gist.html"),
        newGistDialog           = require("text!templates/newGistDialog.html"),
        successGistDialog       = require("text!templates/successGistDialog.html");

    var CommandManager          = brackets.getModule("command/CommandManager"),
        DocumentManager         = brackets.getModule("document/DocumentManager"),
        Dialogs                 = brackets.getModule("widgets/Dialogs"),
        EditorManager           = brackets.getModule("editor/EditorManager"),
        ExtensionUtils          = brackets.getModule("utils/ExtensionUtils"),
        Menus                   = brackets.getModule("command/Menus"),
        PanelManager            = brackets.getModule("view/PanelManager");

    var Strings                 = require("strings");

    var $panel                  = $(),
        $content                = $(),
        gists                   = null;

    var TOGGLE_PANEL            = "gist-manager.run",
        GIST_FROM_CURRENT_FILE  = "gist-manager.fromfile",
        GM_PANEL                = "gist-manager.panel",
        NEW_GIST_MENU           = "gist-manager.menu";


    // Make :contains case insensitive
    $.extend($.expr[":"], {
        "containsIN": function(elem, i, match) {
            return (elem.textContent || elem.innerText || "").toLowerCase().indexOf((match[3] || "").toLowerCase()) >= 0;
        }
    });

    // Show or hide Gist Manager panel when called
    function _handlePanelToggle() {

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

    // Render a given Gist inside the Gist Manager panel
    function renderGist(gistData) {

        // If the gist we are trying to render is already loded
        // don't load it again but just show the cached version
        // if is not cached then load it from Gist API
        if (!$panel.find("#" + gistData.id).data("loaded")) {

            // Load Gist data and prepare it for Mustache
            $.getJSON(gistData.url, function(gistData) {

                // Convert .files from object to array (needed because Mustache is stupid I guess, or maybe I'm)
                gistData.files = $.map(gistData.files, function(value) {
                    return [value];
                });

                // Render Gist using Mustache
                var vars = gistData;
                $.extend(vars, Strings);
                var $gist = $(Mustache.render(gist, vars));

                // Inject the rendered Gist in the Gist Manager panel
                $panel.find("#" + gistData.id).html($gist).data("loaded", true);
            });
        }

        // Move things around to show the selected Gist
        $panel
            .find(".gist").hide().end()
            .find("a").removeClass("active").end()
            .find("a[href=#" + gistData.id + "]").addClass("active").end()
            .find("#" + gistData.id).show();
    }

    // Load list of Gists
    // if no username is provided then load the public list
    // if username is provided then load the list of the selected username
    // if password is provided then load even the secret Gists of the selected user
    function loadContent(username, password) {

        // These will be used in our Ajax call
        var url,
            headers;

        // Set headers and API URL depending if we are trying to get public gists
        // user's public gists or user's public & secret gists
        if (username.length && password.length) {
            url = "https://api.github.com/gists";
            headers = { "Authorization": "Basic " + btoa(username + ":" + password) };
        } else if (username.length) {
            url = "https://api.github.com/users/" + username + "/gists";
            headers = { };
        } else {
            url = "https://api.github.com/gists";
            headers = { };
        }

        $.ajax({
            type: "GET",
            url: url,
            dataType: "json",
            headers: headers,
            success: function (data) {
                gists = data;

                $.map(gists, function(gist) {

                    gist.shortDescription = gist.description.substring(0, 20);
                    if (!gist.shortDescription.length) {
                        gist.shortDescription = "gist:" + gist.id;
                    }
                    return gist;

                });

                _renderContent(gists);
            },
            error: function (err) {
                var response = JSON.parse(err.responseText);
                Dialogs.showModalDialog("error-dialog", Strings.LOADING_ERROR, response.message);
                console.error("gist-manager:", err);
            }
        });

        // Renders a given list of Gists inside the panel
        function _renderContent(gists) {

            var vars = {"gists": gists};
            $content = $(Mustache.render(content, vars));
            $panel.find(".gist-manager-content").html($content);

            // Render the first gist
            renderGist(gists[0]);

            // Add event handler on the list of Gists
            $panel.on("click", ".list-group-item", function(event) {

                gists.forEach( function(gist) {
                    if (gist.id == $(event.target).data("id")) {
                        renderGist(gist);
                        return;
                    }
                });

            });
        }
    }

    function filterContent(query) {

        $panel.find(".gist-manager-content .list li").show();
        $panel.find(".gist-manager-content .list li:not(:containsIN('" + query + "'))").hide();

    }

    // Post a new Gist
    function newGist(username, password, entireFile) {

        var content         = "",
            gistFileName    = "",
            filename        = DocumentManager.getCurrentDocument().file._name,
            selection       = EditorManager.getCurrentFullEditor().getSelectedText();


        if (entireFile) {
            content = DocumentManager.getCurrentDocument()._masterEditor.document.file._contents;
        } else if (selection.length) {
            content = selection;
        }

        if (content.length  && filename.length) {
            gistFileName = filename;
        }

        var vars = $.extend({"content": content, "filename": gistFileName, "secret": (username.length && password.length)}, Strings);

        var dialog  = Dialogs.showModalDialogUsingTemplate(Mustache.render(newGistDialog, vars)),
            $dialog = dialog.getElement();

        $dialog.
            on("click", "#add-file", function() {
                $dialog.find("#prototype-file .file").first().clone().appendTo("#files");
            });

        dialog.done(function (buttonId) {
            if (buttonId === "create-public-gist" || buttonId === "create-secret-gist") {

                var url = "https://api.github.com/gists",
                    headers;

                var gistData = {
                    "description": $dialog.find("[name=description]").val(),
                    "public": (buttonId === "create-public-gist"),
                    "files": { }
                };

                $dialog.find("#files .file").each( function() {
                    gistData.files[$(this).find(".filename").val()] = {};
                    gistData.files[$(this).find(".filename").val()].content = $(this).find(".content").val();
                });

                // Set header if user wants to be authenticated
                if (username.length && password.length) {
                    headers = { "Authorization": "Basic " + btoa(username + ":" + password) };
                } else {
                    headers =  { };
                }

                console.log(JSON.stringify(gistData));
                $.ajax({
                    type: "POST",
                    url: url,
                    dataType: "json",
                    headers: headers,
                    data: JSON.stringify(gistData),
                    success: function (response) {
                        var vars = $.extend(response, Strings);
                        var dialog = Dialogs.showModalDialogUsingTemplate(Mustache.render(successGistDialog, vars));

                        dialog.done(function (buttonId) {
                            if (buttonId === "open") {
                                brackets.app.openURLInDefaultBrowser(response.html_url);
                            }
                        });

                        if (username.length && password.length) {
                            loadContent(username, password);
                        }
                    },
                    error: function (err) {
                        var response = JSON.parse(err.responseText);
                        Dialogs.showModalDialog("error-dialog", Strings.CREATION_ERROR, response.message);
                        console.error("gist-manager:", err);
                    }
                });
            }
        });
    }

    function init() {

        // Load compiled CSS of Gist Manager
        ExtensionUtils.loadStyleSheet(module, "styles/gist-manager.css");

        // Add menu option to toggle Gist Manager panel
        CommandManager.register(Strings.SHOW_GIST_MANAGER, TOGGLE_PANEL, _handlePanelToggle);
        var menu = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU);
        menu.addMenuItem(TOGGLE_PANEL, null, Menus.AFTER);

        // Add menu option to create Gist of the current file
        CommandManager.register(Strings.GIST_FROM_CURRENT_FILE, GIST_FROM_CURRENT_FILE, function() {
            newGist($panel.find("#github-username").val(), $panel.find("#github-password").val(), true);
        });
        var editMenu = Menus.getMenu(Menus.AppMenuBar.EDIT_MENU);
        editMenu.addMenuItem(GIST_FROM_CURRENT_FILE, null, Menus.AFTER);

        // Add context menu option to create gist
        CommandManager.register(
            Strings.CREATE_NEW_GIST,
            NEW_GIST_MENU,
            function() { newGist($panel.find("#github-username").val(), $panel.find("#github-password").val()); }
        );
        var contextMenu = Menus.getContextMenu(Menus.ContextMenuIds.EDITOR_MENU);
        contextMenu.addMenuItem(NEW_GIST_MENU);

        // Create Gist Manager panel
        PanelManager.createBottomPanel(GM_PANEL, $(Mustache.render(panel, Strings)), 200);

        // Cache selection of Gist Manager panel
        $panel = $("#gist-manager");

        // Add events handler to Gist Manager panel
        $panel
            .on("click", "#load-gists", function() {
                loadContent($panel.find("#github-username").val(), $panel.find("#github-password").val());
            })
            .on("click", "#new-gist", function() {
                newGist($panel.find("#github-username").val(), $panel.find("#github-password").val());
            })
            .on("keyup", "#filter-content", function() {
                filterContent($panel.find("#filter-content").val());
            })
            .on("click", ".close", _handlePanelToggle);
    }

    init();

});

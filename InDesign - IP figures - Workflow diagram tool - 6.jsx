// =============================================================
// FLOWCHART BUILDER - Phase 1 + 2
// =============================================================
// Phase 1: Dialog UI + Page Resolution
// Phase 2: Template Object Detection
// =============================================================

(function () {

    try {

        // =====================================================
        // UTILITIES
        // =====================================================

        function getPagesWithMaster(doc, scalePrefix) {
            var result = [];
            for (var i = 0; i < doc.pages.length; i++) {
                var page = doc.pages[i];
                try {
                    if (
                        page.appliedMaster !== null &&
                        page.appliedMaster.isValid &&
                        page.appliedMaster.name.indexOf(scalePrefix) !== -1
                    ) {
                        result.push(page);
                    }
                } catch (e) {}
            }
            return result;
        }

        function pageHasTextBoxContent(page) {
            try {
                var items = page.allPageItems;
                for (var i = 0; i < items.length; i++) {
                    var item = items[i];
                    try {
                        if (item.name && item.name.indexOf("Object_TextBox") === 0) {
                            var contents = "";
                            try { contents = item.contents; } catch (e2) {}
                            if (contents.replace(/[\r\n\s]/g, "").length > 0) {
                                return true;
                            }
                        }
                    } catch (e) {}
                }
            } catch (e) {}
            return false;
        }

        function findMasterByName(doc, scalePrefix) {
            for (var i = 0; i < doc.masterSpreads.length; i++) {
                try {
                    if (doc.masterSpreads[i].name.indexOf(scalePrefix) !== -1) {
                        return doc.masterSpreads[i];
                    }
                } catch (e) {}
            }
            return null;
        }

        function detectScaleFromPage(page) {
            try {
                if (!page || !page.isValid) { return null; }
                if (!page.appliedMaster || !page.appliedMaster.isValid) { return null; }
                var name = page.appliedMaster.name;
                var scales = ["S4", "S3", "S2", "S1"];
                for (var i = 0; i < scales.length; i++) {
                    if (name.indexOf(scales[i]) !== -1) { return scales[i]; }
                }
                return null;
            } catch (e) { return null; }
        }

        function resolveWorkingPage(doc, scalePrefix) {
            var pages = getPagesWithMaster(doc, scalePrefix);

            if (pages.length === 0) {
                var master = findMasterByName(doc, scalePrefix);
                if (!master) {
                    alert(
                        "No master spread containing \"" + scalePrefix + "\" found in this document.\n\n" +
                        "Please add a master spread with \"" + scalePrefix + "\" in its name."
                    );
                    return null;
                }
                var autoPage = doc.pages.add(LocationOptions.AT_END);
                autoPage.appliedMaster = master;
                return autoPage;
            }

            var masterToApply = pages[0].appliedMaster;
            var cleanPage = null;

            for (var i = 0; i < pages.length; i++) {
                if (!pageHasTextBoxContent(pages[i])) {
                    cleanPage = pages[i];
                    break;
                }
            }

            if (cleanPage === null) {
                var newPage = doc.pages.add(LocationOptions.AT_END);
                newPage.appliedMaster = masterToApply;
                return newPage;
            }

            return cleanPage;
        }

        // =====================================================
        // CSV PARSER
        // =====================================================
        // CSV PARSER -- RFC 4180 compliant
        // Supports multiline quoted cells (cells spanning multiple
        // physical lines), "" escape pairs, and single-column format.
        // Each quoted cell = one flowchart step.
        // Internal newlines in cells are converted to \r so InDesign
        // treats them as paragraph breaks (required for style detection).
        // =====================================================
        function parseCSV(file) {
            var steps = [];

            // Read the entire file into one string so multiline quoted
            // cells (which span physical line breaks) can be parsed
            // without losing the line-break context.
            file.open("r");
            var raw = file.read();
            file.close();

            // Normalise all line endings to \n
            raw = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

            var pos = 0;
            var len = raw.length;

            while (pos < len) {
                var value = "";

                if (raw.charAt(pos) === "\"") {
                    // --- Quoted field (may span multiple lines) ---
                    pos++; // skip opening quote
                    while (pos < len) {
                        var ch = raw.charAt(pos);
                        if (ch === "\"") {
                            if (raw.charAt(pos + 1) === "\"") {
                                value += "\""; // escaped quote pair
                                pos += 2;
                            } else {
                                pos++; // skip closing quote
                                break;
                            }
                        } else {
                            value += ch;
                            pos++;
                        }
                    }
                } else {
                    // --- Unquoted field: ends at newline ---
                    while (pos < len && raw.charAt(pos) !== "\n") {
                        value += raw.charAt(pos);
                        pos++;
                    }
                }

                // Advance past the row terminator
                while (pos < len && raw.charAt(pos) !== "\n") { pos++; }
                if (pos < len) { pos++; } // skip the \n itself

                // Skip blank entries
                if (value.replace(/[\r\n\s]/g, "") === "") { continue; }

                // Convert internal \n to \r so InDesign sees paragraph breaks
                steps.push(value.replace(/\n/g, "\r"));
            }

            return steps;
        }

        // =====================================================
        // CSV PARSER -- S4 two-column format
        // Col A = Title text, Col B = Body text.
        // Each row produces one { title, body } step object.
        // Multiline cells supported (RFC 4180 quoted cells).
        // =====================================================
        function parseCSVS4(file) {
            var steps = [];
            file.open("r");
            var raw = file.read();
            file.close();

            raw = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
            var pos = 0, len = raw.length;

            function readField() {
                if (pos >= len) { return ""; }
                var val = "";
                if (raw.charAt(pos) === "\"") {
                    pos++;
                    while (pos < len) {
                        var ch = raw.charAt(pos);
                        if (ch === "\"") {
                            if (raw.charAt(pos + 1) === "\"") { val += "\""; pos += 2; }
                            else { pos++; break; }
                        } else { val += ch; pos++; }
                    }
                } else {
                    while (pos < len && raw.charAt(pos) !== "," && raw.charAt(pos) !== "\n") {
                        val += raw.charAt(pos); pos++;
                    }
                }
                return val;
            }

            while (pos < len) {
                var title = readField();
                // Advance past comma to body field
                if (pos < len && raw.charAt(pos) === ",") { pos++; }
                var body  = readField();
                // Advance past row terminator
                while (pos < len && raw.charAt(pos) !== "\n") { pos++; }
                if (pos < len) { pos++; }

                if (title.replace(/[\r\n\s]/g, "") === "" &&
                    body.replace(/[\r\n\s]/g, "")  === "") { continue; }

                steps.push({
                    title: title.replace(/\n/g, "\r"),
                    body:  body.replace(/\n/g, "\r")
                });
            }
            return steps;
        }

        // =====================================================
        // DIALOG
        // =====================================================
        function buildDialog(doc, activePage, detectedScale) {

            var result = null;

            // ---- Window -------------------------------------
            var dlg = new Window("dialog", "Flowchart Builder");
            dlg.orientation   = "column";
            dlg.alignChildren = ["fill", "top"];
            dlg.spacing       = 12;
            dlg.margins       = [18, 18, 18, 18];

            var _screenH = $.screens[0].height;
            var _dlgH    = Math.round(_screenH * 0.80);
            dlg.preferredSize = [-1, _dlgH];

            // ---- Context info bar ---------------------------
            var infoGroup = dlg.add("group");
            infoGroup.orientation   = "row";
            infoGroup.alignChildren = ["left", "center"];
            infoGroup.margins       = [4, 0, 4, 0];
            var infoText = infoGroup.add(
                "statictext", undefined,
                "Page: " + activePage.name + ",  Scale: " + detectedScale
            );
            infoText.minimumSize = [330, 20];

            // ---- Diagram Name -------------------------------
            var titlePanel = dlg.add("panel", undefined, "Diagram Name");
            titlePanel.orientation   = "row";
            titlePanel.alignChildren = ["left", "center"];
            titlePanel.margins       = [14, 18, 14, 12];

            var titleInput = titlePanel.add("edittext", undefined, "");
            titleInput.minimumSize = [330, 22];
            titleInput.maximumSize = [330, 22];
            titleInput.helpTip     = "Replaces content of Title_Flowchart on the working page";

            // ---- Shared state — assigned in the conditional block below ----
            var rows           = null; // S1/S2/S3 step row objects
            var s4Rows         = null; // S4 step row objects
            var s4T1Input      = null; // S4 Title-1 header input
            var s4T2Input      = null; // S4 Title-2 header input
            var populateRows   = null; // fills the steps panel from an array
            var populateRowsS4 = null; // fills the S4 panel from an array

            function relayout() {
                var loc = [dlg.location[0], dlg.location[1]];
                dlg.layout.layout(true);
                dlg.location = loc;
                dlg.update();
            }

            if (detectedScale === "S4") {
                // ================================================================
                // S4 PANEL — only built when detected scale is S4
                // ================================================================
                var s4Panel = dlg.add("panel", undefined, "S4 Flowchart Steps");
                s4Panel.orientation   = "column";
                s4Panel.alignChildren = ["fill", "top"];
                s4Panel.spacing       = 8;
                s4Panel.margins       = [10, 18, 10, 10];

                var s4HeaderGroup = s4Panel.add("group");
                s4HeaderGroup.orientation   = "column";
                s4HeaderGroup.alignChildren = ["fill", "top"];
                s4HeaderGroup.spacing       = 6;

                var s4T1Group = s4HeaderGroup.add("group");
                s4T1Group.orientation   = "row";
                s4T1Group.alignChildren = ["left", "center"];
                s4T1Group.spacing       = 8;
                s4T1Group.add("statictext", undefined, "Title 1:");
                s4T1Input = s4T1Group.add("edittext", undefined, "");
                s4T1Input.minimumSize = [290, 22];
                s4T1Input.maximumSize = [290, 22];
                s4T1Input.helpTip     = "Populates Text_T1 on the working page";

                var s4T2Group = s4HeaderGroup.add("group");
                s4T2Group.orientation   = "row";
                s4T2Group.alignChildren = ["left", "center"];
                s4T2Group.spacing       = 8;
                s4T2Group.add("statictext", undefined, "Title 2:");
                s4T2Input = s4T2Group.add("edittext", undefined, "");
                s4T2Input.minimumSize = [290, 22];
                s4T2Input.maximumSize = [290, 22];
                s4T2Input.helpTip     = "Populates Text_T2 on the working page";

                var s4RowContainer = s4Panel.add("group");
                s4RowContainer.orientation   = "column";
                s4RowContainer.alignChildren = ["fill", "top"];
                s4RowContainer.spacing       = 8;

                s4Rows = [];

                var reindexRowsS4 = function () {
                    for (var i = 0; i < s4Rows.length; i++) {
                        s4Rows[i].indexLabel.text = (i + 1) + ".";
                    }
                };

                var addRowS4 = function (prefillTitle, prefillBody) {
                    var row = s4RowContainer.add("group");
                    row.orientation   = "row";
                    row.alignChildren = ["left", "top"];
                    row.spacing       = 6;

                    var lbl = row.add("statictext", undefined, (s4Rows.length + 1) + ".");
                    lbl.minimumSize = [22, 20];

                    var titleGroup = row.add("group");
                    titleGroup.orientation   = "column";
                    titleGroup.alignChildren = ["left", "top"];
                    titleGroup.spacing       = 2;
                    titleGroup.add("statictext", undefined, "Title");
                    var titleField = titleGroup.add("edittext", undefined, prefillTitle || "", { multiline: true });
                    titleField.minimumSize = [135, 46];
                    titleField.maximumSize = [135, 46];

                    var bodyGroup = row.add("group");
                    bodyGroup.orientation   = "column";
                    bodyGroup.alignChildren = ["left", "top"];
                    bodyGroup.spacing       = 2;
                    bodyGroup.add("statictext", undefined, "Body");
                    var bodyField = bodyGroup.add("edittext", undefined, prefillBody || "", { multiline: true });
                    bodyField.minimumSize = [135, 46];
                    bodyField.maximumSize = [135, 46];

                    var removeBtn = row.add("button", undefined, "x");
                    removeBtn.minimumSize = [26, 22];
                    removeBtn.maximumSize = [26, 22];

                    var rowObj = { group: row, titleField: titleField, bodyField: bodyField, indexLabel: lbl };

                    removeBtn.onClick = function () {
                        if (s4Rows.length === 1) {
                            titleField.text = "";
                            bodyField.text  = "";
                            return;
                        }
                        s4RowContainer.remove(row);
                        var idx = -1;
                        for (var k = 0; k < s4Rows.length; k++) {
                            if (s4Rows[k] === rowObj) { idx = k; break; }
                        }
                        if (idx !== -1) { s4Rows.splice(idx, 1); }
                        reindexRowsS4();
                        relayout();
                    };

                    s4Rows.push(rowObj);
                    return rowObj;
                };

                populateRowsS4 = function (values) {
                    for (var i = s4Rows.length - 1; i >= 0; i--) {
                        s4RowContainer.remove(s4Rows[i].group);
                    }
                    s4Rows.length = 0;
                    for (var j = 0; j < values.length; j++) {
                        addRowS4(values[j].title || "", values[j].body || "");
                    }
                    if (s4Rows.length === 0) { addRowS4(); }
                    relayout();
                };

                addRowS4();

                var addS4StepBtn = s4Panel.add("button", undefined, "+ Add Step");
                addS4StepBtn.alignment   = ["left", "center"];
                addS4StepBtn.minimumSize = [100, 24];
                addS4StepBtn.onClick = function () { addRowS4(); relayout(); };

            } else {
                // ================================================================
                // STEPS PANEL (S1/S2/S3) — only built when detected scale is not S4
                // ================================================================
                var stepsPanel = dlg.add("panel", undefined, "Flowchart Steps");
                stepsPanel.orientation   = "column";
                stepsPanel.alignChildren = ["fill", "top"];
                stepsPanel.spacing       = 6;
                stepsPanel.margins       = [10, 18, 10, 10];

                var rowContainer = stepsPanel.add("group");
                rowContainer.orientation   = "column";
                rowContainer.alignChildren = ["fill", "top"];
                rowContainer.spacing       = 5;

                rows = [];

                var reindexRows = function () {
                    for (var i = 0; i < rows.length; i++) {
                        rows[i].indexLabel.text = (i + 1) + ".";
                    }
                };

                var addRow = function (prefillText) {
                    var row = rowContainer.add("group");
                    row.orientation   = "row";
                    row.alignChildren = ["left", "top"];
                    row.spacing       = 6;

                    var lbl = row.add("statictext", undefined, (rows.length + 1) + ".");
                    lbl.minimumSize = [22, 20];

                    // Enter produces \r (hard paragraph break in InDesign).
                    var input = row.add("edittext", undefined, prefillText || "", { multiline: true });
                    input.minimumSize = [290, 46];
                    input.maximumSize = [290, 46];

                    var removeBtn = row.add("button", undefined, "x");
                    removeBtn.minimumSize = [26, 22];
                    removeBtn.maximumSize = [26, 22];
                    removeBtn.helpTip     = "Remove this step";

                    var rowObj = { group: row, inputField: input, indexLabel: lbl };

                    removeBtn.onClick = function () {
                        if (rows.length === 1) {
                            input.text = "";
                            return;
                        }
                        rowContainer.remove(row);
                        var idx = -1;
                        for (var k = 0; k < rows.length; k++) {
                            if (rows[k] === rowObj) { idx = k; break; }
                        }
                        if (idx !== -1) { rows.splice(idx, 1); }
                        reindexRows();
                        relayout();
                    };

                    rows.push(rowObj);
                    return rowObj;
                };

                populateRows = function (values) {
                    for (var i = rows.length - 1; i >= 0; i--) {
                        rowContainer.remove(rows[i].group);
                    }
                    rows.length = 0;
                    for (var j = 0; j < values.length; j++) {
                        addRow(values[j]);
                    }
                    if (rows.length === 0) { addRow(); }
                    relayout();
                };

                addRow();

                var addStepBtn = stepsPanel.add("button", undefined, "+ Add Step");
                addStepBtn.alignment   = ["left", "center"];
                addStepBtn.minimumSize = [100, 24];
                addStepBtn.onClick = function () { addRow(); relayout(); };
            }

            var currentScale = detectedScale;

            // ---- Bottom Buttons -----------------------------
            var bottomGroup = dlg.add("group");
            bottomGroup.orientation   = "row";
            bottomGroup.alignChildren = ["fill", "center"];
            bottomGroup.spacing       = 8;

            var csvBtn = bottomGroup.add("button", undefined, "Load from CSV");
            csvBtn.minimumSize = [120, 24];

            var spacer = bottomGroup.add("group");
            spacer.minimumSize = [20, 10];

            var cancelBtn = bottomGroup.add("button", undefined, "Cancel");
            cancelBtn.minimumSize = [80, 24];

            var okBtn = bottomGroup.add("button", undefined, "OK");
            okBtn.minimumSize = [80, 24];

            // ---- CSV Handler --------------------------------
            // S1/S2/S3: single-column CSV (one step per row/cell).
            // S4:       two-column CSV — col A = Title, col B = Body.
            csvBtn.onClick = function () {
                var file = File.openDialog(
                    "Select a CSV file",
                    "CSV Files:*.csv,Text Files:*.txt,All Files:*.*"
                );
                if (!file) { return; }

                if (currentScale === "S4") {
                    var s4Steps = parseCSVS4(file);
                    if (s4Steps.length === 0) {
                        alert("CSV contained no readable steps.\nExpected two columns: Title, Body.");
                        return;
                    }
                    populateRowsS4(s4Steps);
                } else {
                    var steps = parseCSV(file);
                    if (steps.length === 0) {
                        alert(
                            "The selected CSV file contained no readable step labels.\n\n" +
                            "Check that the file is not empty and uses UTF-8 or plain ASCII encoding."
                        );
                        return;
                    }
                    populateRows(steps);
                }
            };

            // ---- Cancel -------------------------------------
            cancelBtn.onClick = function () {
                dlg.close();
            };

            // ---- OK -----------------------------------------
            okBtn.onClick = function () {
                var selectedScale = currentScale;
                var workingPage = activePage;

                if (selectedScale === "S4") {
                    // ---- S4: collect dual-field steps ---------------
                    var s4Steps = [];
                    for (var i = 0; i < s4Rows.length; i++) {
                        var t = s4Rows[i].titleField.text;
                        var b = s4Rows[i].bodyField.text;
                        if (t.replace(/\s/g, "") !== "" || b.replace(/\s/g, "") !== "") {
                            s4Steps.push({ title: t, body: b });
                        }
                    }
                    if (s4Steps.length === 0) {
                        alert("Please enter at least one step before clicking OK.");
                        return;
                    }
                    result = {
                        scale     : "S4",
                        steps     : s4Steps,
                        workingPage: workingPage,
                        title     : titleInput.text,
                        s4Header  : { t1: s4T1Input.text, t2: s4T2Input.text }
                    };
                } else {
                    // ---- S1/S2/S3: collect single-field steps -------
                    var steps = [];
                    for (var i = 0; i < rows.length; i++) {
                        var val = rows[i].inputField.text;
                        if (val.replace(/\s/g, "") !== "") { steps.push(val); }
                    }
                    if (steps.length === 0) {
                        alert("Please enter at least one step before clicking OK.");
                        return;
                    }
                    result = {
                        scale       : selectedScale,
                        steps       : steps,
                        workingPage : workingPage,
                        title       : titleInput.text
                    };
                }

                dlg.close();
            };

            // ---- Show ---------------------------------------
            dlg.show();

            return result;
        }

        // =====================================================
        // PHASE 2: TEMPLATE OBJECT DETECTION
        // =====================================================

        /**
         * Generic item finder. Walks all page items on the working page
         * (pass 1) and the master spread pages (pass 2), returning the
         * first item for which matchFn(item) returns true.
         *
         * Using a callback keeps the two-pass traversal in one place while
         * allowing each template object to define its own matching rule.
         */
        function findItem(workingPage, matchFn) {
            // --- Pass 1: working page (includes master-inherited items) ---
            try {
                var items = workingPage.allPageItems;
                for (var i = 0; i < items.length; i++) {
                    try { if (matchFn(items[i])) { return items[i]; } } catch (e) {}
                }
            } catch (e) {}

            // --- Pass 2: master spread pages (explicit fallback) ----------
            try {
                if (workingPage.appliedMaster && workingPage.appliedMaster.isValid) {
                    var masterPages = workingPage.appliedMaster.pages;
                    for (var p = 0; p < masterPages.length; p++) {
                        var mItems = masterPages[p].allPageItems;
                        for (var j = 0; j < mItems.length; j++) {
                            try { if (matchFn(mItems[j])) { return mItems[j]; } } catch (e) {}
                        }
                    }
                }
            } catch (e) {}

            return null;
        }

        /**
         * Extracts geometry from an InDesign page item.
         *
         * geometricBounds returns [top, left, bottom, right].
         * InDesign's transform panel shows X=left, Y=top, W=width, H=height
         * using the document's current measurement units.
         *
         * Returns: { x, y, w, h, top, left, bottom, right }
         */
        function getItemGeometry(item) {
            var b = item.geometricBounds; // [top, left, bottom, right]
            return {
                x      : b[1],
                y      : b[0],
                w      : b[3] - b[1],
                h      : b[2] - b[0],
                top    : b[0],
                left   : b[1],
                bottom : b[2],
                right  : b[3]
            };
        }

        /**
         * Returns a human-readable label for the document's current
         * horizontal measurement units (matches the transform panel).
         */
        function getUnitLabel(doc) {
            try {
                var u = doc.viewPreferences.horizontalMeasurementUnits;
                var map = {};
                map[MeasurementUnits.POINTS]     = "pt";
                map[MeasurementUnits.MILLIMETERS] = "mm";
                map[MeasurementUnits.CENTIMETERS] = "cm";
                map[MeasurementUnits.INCHES]      = "in";
                map[MeasurementUnits.PICAS]       = "pica";
                map[MeasurementUnits.PIXELS]      = "px";
                return map[u] || "doc units";
            } catch (e) {
                return "doc units";
            }
        }

        /**
         * Detects both template objects by Layers-panel name prefix.
         *
         * Matching rules (number suffix is ignored):
         *
         *   TextBox — name must:
         *     • start with  "Object_TextBox"
         *     • contain the scale designator  "S1_", "S2_" or "S3_"
         *     e.g. "Object_TextBox_S3_01" matches when scale === "S3"
         *
         *   Arrow — name must:
         *     • start with  "Object_Arrow"
         *     e.g. "Object_Arrow_01" always matches
         *
         * Returns: { textBox: { item, geo, layerName },
         *            arrow:   { item, geo, layerName } }
         *          or null if either object cannot be found.
         */
        function detectTemplateObjects(doc, workingPage, scale) {
            var scaleTag = scale + "_"; // "S1_" or "S2_"

            var tbItem = findItem(workingPage, function (item) {
                var n = item.name;
                return n.indexOf("Object_TextBox") === 0 &&
                       n.indexOf(scaleTag)         !== -1;
            });

            var arItem = findItem(workingPage, function (item) {
                return item.name.indexOf("Object_Arrow") === 0;
            });

            var missing = [];
            if (!tbItem) { missing.push("Object_TextBox + scale tag \"" + scaleTag + "\""); }
            if (!arItem) { missing.push("Object_Arrow"); }

            if (missing.length > 0) {
                alert(
                    "Template object(s) not found on the working page or its master.\n\n" +
                    "Could not find a Layers-panel item matching:\n  " +
                    missing.join("\n  ") + "\n\n" +
                    "Check the Layers panel and confirm:\n" +
                    "  - TextBox name starts with \"Object_TextBox\" and contains \"" + scaleTag + "\"\n" +
                    "    e.g. Object_TextBox_" + scale + "_01\n" +
                    "  - Arrow name starts with \"Object_Arrow\"\n" +
                    "    e.g. Object_Arrow_01"
                );
                return null;
            }

            return {
                textBox : { item: tbItem, geo: getItemGeometry(tbItem), layerName: tbItem.name },
                arrow   : { item: arItem, geo: getItemGeometry(arItem), layerName: arItem.name }
            };
        }

        // =====================================================
        // PHASE 3: DUPLICATION, TEXT INJECTION, POSITIONING
        // =====================================================

        /**
         * Resolves the correct paragraph style object from the document,
         * returning null (silently) if the style does not exist.
         */
        function getParaStyle(doc, styleName) {
            try {
                var s = doc.paragraphStyles.item(styleName);
                if (s && s.isValid) { return s; }
            } catch (e) {}
            return null;
        }

        /**
         * Detects the content type of a single line and returns the
         * appropriate paragraph style name for the given scale, or null
         * if the default body style should be kept.
         *
         * Rules:
         *   Numbered: digit(s) then "." or ")" or " " (with/without trailing space)
         *     Matches: "1. item"  "1 item"  "1.item"  "12) item"
         *     Rejects: "one. item" (written ordinal -- no leading digit)
         *   Bullets:  starts with "- " or bullet character
         *   Body:     everything else -> null (keep frame default)
         *
         * FIX: was /^\d+[\.)\s]\s/ -- required TWO chars after digit.
         * Now /^\d+[\.)\s]/ -- one separator character is enough, so
         * "1.item" (no space) and "1 item" (space, no dot) both match.
         */
        function detectLineStyle(lineText, scaleNum) {
            if (/^\d+[\.)\s]/.test(lineText)) {
                return "NumberedList_S" + scaleNum;
            }
            if (/^[-\u2022]\s/.test(lineText)) {
                return "Bullets_S" + scaleNum;
            }
            return null;
        }

        /**
         * Positions a duplicated text frame, injects text with per-paragraph
         * style detection, then auto-sizes height.
         *
         * Steps:
         *  1. Set frame to a very tall height (text never overflows during read).
         *  2. Inject full text — \r chars become InDesign paragraph breaks.
         *  3. Walk each paragraph; apply NumberedList or Bullets style where
         *     the line prefix rule matches; leave body paragraphs unstyled.
         *  4. Read last character baseline Y and trim frame to baseline + scaleOffset.
         *
         * Returns the final bottom Y coordinate for stacking.
         */
        function placeTextBox(newTB, boxX, boxY, boxWidth, text, scaleOffset, scaleNum, doc) {
            // Step 1: tall temporary frame
            newTB.geometricBounds = [boxY, boxX, boxY + 10000, boxX + boxWidth];

            // Step 2: normalise line endings then inject.
            //
            // ROOT CAUSE FIX: ScriptUI multiline edittext produces \n (0x0A,
            // forced line break) when the user presses Enter -- NOT \r (0x0D,
            // hard paragraph break). In InDesign these are entirely different:
            //   \r -> new paragraph  -> paragraph style CAN be applied
            //   \n -> forced line break (Shift+Enter) -> stays in same paragraph
            //        -> paragraph style detection never fires
            //
            // Without this normalisation, the entire text block is ONE paragraph
            // regardless of how many lines it contains, so detectLineStyle only
            // ever sees the first line and numbered/bullet styles are never applied.
            //
            // Fix: convert \r\n (Windows CRLF) and bare \n to \r before injection.
            text = text.replace(/\r\n/g, "\r").replace(/\n/g, "\r");
            newTB.contents = text;

            // Step 3: apply paragraph styles per paragraph.
            //
            // BUG FIX: two issues addressed here:
            //
            //  a) Live-collection invalidation: newTB.paragraphs is a live
            //     DOM collection. Applying a style to paragraph[p] can cause
            //     InDesign to re-evaluate the collection, shifting indices and
            //     corrupting subsequent iterations. Fix: snapshot all paragraph
            //     texts into a static array BEFORE modifying anything.
            //
            //  b) Silent failure: the broad try/catch swallowed all errors,
            //     making it impossible to see why styles were not applying.
            //     Fix: granular per-paragraph try/catch with error logging.

            // Pass A: snapshot paragraph texts into a plain JS array.
            // All subsequent passes read from this static array — never
            // from the live DOM collection — so index drift cannot occur.
            var paraCount  = 0;
            var paraTexts  = [];
            try {
                paraCount = newTB.paragraphs.length;
                for (var s = 0; s < paraCount; s++) {
                    try { paraTexts.push(newTB.paragraphs[s].contents); }
                    catch (e) { paraTexts.push(""); }
                }
            } catch (e) {}

            // Pass B: build cleanedTexts and styleNames arrays.
            //
            // ROOT CAUSE FIX for paragraph merging:
            // Setting paragraph.contents = "text" (without a trailing \r) causes
            // InDesign to remove the paragraph separator, merging that paragraph
            // with the next. The live collection then shifts, so every subsequent
            // index points at the wrong paragraph. The alternating merge pattern
            // is a direct consequence of this index drift.
            //
            // Fix: NEVER write to individual paragraph.contents. Instead, build
            // all cleaned strings into a plain JS array first (no DOM touching),
            // then reconstruct the entire frame contents in ONE call so InDesign
            // sees the correct paragraph structure from the start.
            //
            // Strip regexes:
            //   Numbered: /^\d+[\.)]?\s*/
            //     "1. item" -> "item"  "1.item" -> "item"  "1   item" -> "item"
            //   Bullets:  /^[-\u2022\u2013]\s*/
            //     "- item" -> "item"   "• item" -> "item"
            var cleanedTexts = [];
            var styleNames   = [];

            for (var p = 0; p < paraCount; p++) {
                var raw       = paraTexts[p].replace(/\r$/, ""); // strip trailing paragraph marker
                var sName     = detectLineStyle(raw, scaleNum);
                var cleaned   = raw;

                if (sName) {
                    cleaned = raw
                        .replace(/^\d+[\.)]?\s*/, "")       // strip numeric prefix
                        .replace(/^[-\u2022\u2013]\s*/, ""); // strip bullet prefix
                }

                cleanedTexts.push(cleaned);
                styleNames.push(sName); // null for body paragraphs
            }

            // Reconstruct the full frame contents from cleaned texts joined by \r.
            // A single contents assignment is atomic — no mid-write collection shifts.
            newTB.contents = cleanedTexts.join("\r");

            // Pass C: apply paragraph styles to the now-stable paragraph collection.
            // No contents are modified here so the collection cannot shift.
            for (var q = 0; q < styleNames.length; q++) {
                if (styleNames[q]) {
                    try {
                        var style = getParaStyle(doc, styleNames[q]);
                        if (style) {
                            newTB.paragraphs[q].appliedParagraphStyle = style;
                        }
                    } catch (e) {
                        $.writeln("Style error para " + q + " (" + styleNames[q] + "): " + e.message);
                    }
                }
            }

            // Step 4: read last-line baseline and trim frame
            var baselineY;
            try {
                baselineY = newTB.characters.lastItem().baseline;
            } catch (e) {
                try {
                    newTB.fit(FitOptions.FRAME_TO_CONTENT);
                    baselineY = newTB.geometricBounds[2];
                } catch (e2) {
                    baselineY = boxY + 20;
                }
            }

            var finalBottom = baselineY + scaleOffset;
            newTB.geometricBounds = [boxY, boxX, finalBottom, boxX + boxWidth];

            return finalBottom;
        }

        /**
         * Places a duplicated arrow below a text box.
         *
         * Arrow is moved by delta from its original template position
         * rather than setting geometricBounds directly. This is safer
         * for rotated objects: move() translates without distorting
         * the rotation or intrinsic shape.
         *
         * Vertical offset uses arrowOffset — the gap between the template
         * textbox bottom and template arrow bounding-box top — NOT the
         * raw 13pt spec value. The 13pt spec measures to a visual reference
         * point on the arrow glyph, which due to −135° rotation does not
         * coincide with the geometricBounds top. Deriving the offset from
         * the template preserves the intended visual gap exactly.
         *
         * Horizontal: arrow is centred under the text box.
         */
        function placeArrow(newAR, arGeo, boxX, boxWidth, boxBottom, arrowOffset) {
            // Target Y: preserve template visual gap below box bottom
            var arTargetY = boxBottom + arrowOffset;

            // Target X: centred under textbox
            var tbCentreX = boxX + boxWidth / 2;
            var arTargetX = tbCentreX - arGeo.w / 2;

            // Translate by delta from template position (preserves rotation)
            var deltaX = arTargetX - arGeo.x;
            var deltaY = arTargetY - arGeo.y;

            newAR.move(undefined, [deltaX, deltaY]);

            return arTargetY; // returned for QA log
        }

        // =====================================================
        // NAME PARSING HELPERS (used by executePhase3)
        // =====================================================

        /**
         * Parses a Layers-panel name into a prefix and a zero-padded
         * numeric suffix.
         *
         * "Object_TextBox_S2_01" -> { prefix: "Object_TextBox_S2_", num: 1, padWidth: 2 }
         * "Object_Arrow_01"      -> { prefix: "Object_Arrow_",      num: 1, padWidth: 2 }
         *
         * Returns null if the name does not end with an underscore + digits.
         */
        function parseNameParts(name) {
            var match = name.match(/^(.*_)(\d+)$/);
            if (!match) { return null; }
            return {
                prefix   : match[1],
                num      : parseInt(match[2], 10),
                padWidth : match[2].length   // preserve original zero-pad width
            };
        }

        /**
         * Formats an integer with zero-padding to the given minimum width.
         * formatNum(2, 2) -> "02"   formatNum(10, 2) -> "10"
         */
        function formatNum(n, padWidth) {
            var s = String(n);
            while (s.length < padWidth) { s = "0" + s; }
            return s;
        }

        // =====================================================
        // TITLE POPULATION
        // =====================================================

        /**
         * Finds the item named "Title_Flowchart" on the working page
         * (or its master as fallback) and sets its text contents to
         * titleText.
         *
         * Matching is by exact Layers-panel name — case-sensitive.
         * Silently skips if titleText is blank.
         */
        function setFlowchartTitle(workingPage, titleText) {
            if (!titleText || titleText.replace(/\s/g, "") === "") { return; }

            var titleItem = findItem(workingPage, function (item) {
                return item.name === "Title_Flowchart";
            });

            if (!titleItem) {
                alert(
                    "Could not find an object named \"Title_Flowchart\" on the " +
                    "working page or its master.\n\n" +
                    "The diagram name was not applied. Check the Layers panel and " +
                    "confirm the object is named exactly \"Title_Flowchart\" (case-sensitive)."
                );
                return;
            }

            try {
                titleItem.contents = titleText;
            } catch (e) {
                alert("Could not set diagram name: " + e.message);
            }
        }

        /**
         * Orchestrates Phase 3 for all steps.
         *
         * Layout rules applied:
         *  - First box: top-left at template object's position (origin)
         *  - Subsequent boxes: top = prevBoxBottom + 19.5pt
         *  - Height: last-line baseline + 6.5pt (S1) or 13pt (S2)
         *  - Arrow: placed after every box except the last
         *  - Arrow vertical offset: derived from template (arGeo.y - tbGeo.bottom)
         *    rather than hardcoded 13pt, to account for rotation-induced
         *    bounding-box overhang on the arrow object
         *  - Arrow X: centred under text box
         *
         * After the loop, the original template text box is removed —
         * it would otherwise remain as an invisible empty box overlapping
         * Box 1. The arrow template is left in place (it sits between
         * master-page items and is not duplicated at position 0).
         *
         * Returns a log array for the QA alert.
         */
        function executePhase3(doc, workingPage, result, templateData) {
            var steps       = result.steps;
            var scale       = result.scale;
            // S3 offset: defaulting to 13pt (same as S2) -- update if spec differs
            var scaleOffset = (scale === "S1") ? 6.5 : 13;
            var scaleNum   = (scale === "S1") ? "1" : (scale === "S2") ? "2" : (scale === "S3") ? "3" : "4";

            var tbTemplate  = templateData.textBox.item;
            var arTemplate  = templateData.arrow.item;
            var tbGeo       = templateData.textBox.geo;
            var arGeo       = templateData.arrow.geo;

            var boxX        = tbGeo.x;
            var boxWidth    = tbGeo.w;
            var prevBottom  = null;
            var log         = [];

            // BUG 1 FIX: derive arrow vertical offset from the template
            // rather than using the raw 13pt spec value.
            // The spec's 13pt is measured to a visual glyph reference point;
            // geometricBounds top sits ~4.875pt higher due to rotation overhang.
            // Template offset = arGeo.y - tbGeo.bottom preserves the exact
            // visual gap the designer intended.
            var arrowOffset = arGeo.y - tbGeo.bottom;

            // Parse template names once so renaming inside the loop
            // can derive each duplicate's sequential suffix.
            // "Object_TextBox_S2_01" -> prefix="Object_TextBox_S2_", num=1, padWidth=2
            var tbNameParts = parseNameParts(templateData.textBox.layerName);
            var arNameParts = parseNameParts(templateData.arrow.layerName);

            for (var i = 0; i < steps.length; i++) {

                // ---- Text box ----------------------------------
                var boxY  = (i === 0) ? tbGeo.y : prevBottom + 19.5;
                var newTB = tbTemplate.duplicate(workingPage);

                // Rename: template suffix + i + 1
                // e.g. template "Object_TextBox_S2_01", i=0 -> "Object_TextBox_S2_02"
                if (tbNameParts) {
                    try {
                        newTB.name = tbNameParts.prefix +
                            formatNum(tbNameParts.num + i + 1, tbNameParts.padWidth);
                    } catch (e) {}
                }

                var boxBottom;
                if (scale === "S4") {
                    // S4: dual-field child frame placement
                    // steps[i] = { title: "...", body: "..." }
                    boxBottom = placeTextBoxS4(newTB, tbGeo, boxY, steps[i], scaleNum, doc);
                } else {
                    boxBottom = placeTextBox(
                        newTB, boxX, boxY, boxWidth, steps[i], scaleOffset, scaleNum, doc
                    );
                }
                prevBottom = boxBottom;

                log.push(
                    "Box " + (i + 1) + ": y=" + boxY.toFixed(1) +
                    "  bottom=" + boxBottom.toFixed(1) +
                    "  h=" + (boxBottom - boxY).toFixed(1)
                );

                // ---- Arrow (not after last box) ----------------
                if (i < steps.length - 1) {
                    var newAR = arTemplate.duplicate(workingPage);

                    // Rename: same suffix formula as textboxes
                    // e.g. template "Object_Arrow_01", i=0 -> "Object_Arrow_02"
                    if (arNameParts) {
                        try {
                            newAR.name = arNameParts.prefix +
                                formatNum(arNameParts.num + i + 1, arNameParts.padWidth);
                        } catch (e) {}
                    }

                    var arTop   = placeArrow(
                        newAR, arGeo, boxX, boxWidth, boxBottom, arrowOffset
                    );

                    log.push(
                        "  Arrow: bbox-top=" + arTop.toFixed(1) +
                        "  (offset=" + arrowOffset.toFixed(3) + " pt)"
                    );
                }
            }

            // Remove the original template text box. detach() breaks the master
            // association first so that remove() permanently deletes the item
            // rather than restoring the master ghost.
            try {
                if (tbTemplate.parentPage === workingPage) {
                    try { tbTemplate.detach(); } catch (e2) {}
                    tbTemplate.remove();
                    log.push("\n(Template textbox removed)");
                } else {
                    var tbOverride = tbTemplate.override(workingPage);
                    if (tbOverride) {
                        try { tbOverride.detach(); } catch (e2) {}
                        tbOverride.remove();
                    }
                    log.push("\n(Template textbox master item removed)");
                }
            } catch (e) {
                log.push("\n(Warning: could not remove template textbox: " + e.message + ")");
            }

            // Same treatment for the template arrow.
            try {
                if (arTemplate.parentPage === workingPage) {
                    try { arTemplate.detach(); } catch (e2) {}
                    arTemplate.remove();
                    log.push("(Template arrow removed)");
                } else {
                    var arOverride = arTemplate.override(workingPage);
                    if (arOverride) {
                        try { arOverride.detach(); } catch (e2) {}
                        arOverride.remove();
                    }
                    log.push("(Template arrow master item removed)");
                }
            } catch (e) {
                log.push("(Warning: could not remove template arrow: " + e.message + ")");
            }

            return log;
        }

        // =====================================================
        // S4 PLACEMENT HELPERS
        // =====================================================

        /**
         * Finds a named child frame inside a group or container.
         * Tries container.pageItems first (direct children),
         * then container.allPageItems (recursive).
         */
        function findChildByName(container, name) {
            try {
                var items = container.pageItems;
                for (var i = 0; i < items.length; i++) {
                    if (items[i].name === name) { return items[i]; }
                }
            } catch (e) {}
            try {
                var items = container.allPageItems;
                for (var i = 0; i < items.length; i++) {
                    if (items[i].name === name) { return items[i]; }
                }
            } catch (e) {}
            return null;
        }

        /**
         * Positions and auto-sizes a single child frame (Text_Title or
         * Text_Body) within Object_TextBox_S4.
         *
         * - Top is set to newTop (same as outer frame top after move)
         * - Left and right are preserved from the template (fixed columns)
         * - Text is injected and paragraph styles applied identically to
         *   placeTextBox (same paragraph detection and strip logic)
         * - Height: last-line baseline + 13pt (S3 offset rule per spec)
         *
         * Returns the final bottom Y coordinate.
         */
        function placeChildFrame(frame, newTop, text, scaleNum, doc) {
            var b = frame.geometricBounds; // [top, left, bottom, right]
            frame.geometricBounds = [newTop, b[1], newTop + 10000, b[3]];

            // Normalise line endings -> paragraph breaks
            text = text.replace(/\r\n/g, "\r").replace(/\n/g, "\r");
            frame.contents = text;

            // Pass A: snapshot
            var paraCount = 0, paraTexts = [], cleanedTexts = [], styleNames = [];
            try {
                paraCount = frame.paragraphs.length;
                for (var s = 0; s < paraCount; s++) {
                    try { paraTexts.push(frame.paragraphs[s].contents); }
                    catch (e) { paraTexts.push(""); }
                }
            } catch (e) {}

            // Pass B: build cleaned + style arrays
            for (var p = 0; p < paraCount; p++) {
                var raw   = paraTexts[p].replace(/\r$/, "");
                var sName = detectLineStyle(raw, scaleNum);
                var cleaned = raw;
                if (sName) {
                    cleaned = raw
                        .replace(/^\d+[\.)]?\s*/, "")
                        .replace(/^[-\u2022\u2013]\s*/, "");
                }
                cleanedTexts.push(cleaned);
                styleNames.push(sName);
            }

            // Atomic re-injection
            frame.contents = cleanedTexts.join("\r");

            // Pass C: apply styles
            for (var q = 0; q < styleNames.length; q++) {
                if (styleNames[q]) {
                    try {
                        var style = getParaStyle(doc, styleNames[q]);
                        if (style) { frame.paragraphs[q].appliedParagraphStyle = style; }
                    } catch (e) {
                        $.writeln("S4 child style error para " + q + ": " + e.message);
                    }
                }
            }

            // Auto-size: baseline + 13pt
            var baselineY;
            try {
                baselineY = frame.characters.lastItem().baseline;
            } catch (e) {
                try { frame.fit(FitOptions.FRAME_TO_CONTENT); baselineY = frame.geometricBounds[2]; }
                catch (e2) { baselineY = newTop + 20; }
            }

            var finalBottom = baselineY + 13;
            frame.geometricBounds = [newTop, b[1], finalBottom, b[3]];
            return finalBottom;
        }

        /**
         * Places a duplicated Object_TextBox_S4 frame:
         *  1. Moves the entire frame (+ children) to boxY using move().
         *  2. Finds Text_Title and Text_Body child frames by name.
         *  3. Auto-sizes each child independently via placeChildFrame.
         *  4. Sets outer frame bottom = max(titleBottom, bodyBottom).
         *
         * Child X positions and widths are fixed (inherited from template).
         * Returns the final outer frame bottom Y.
         */
        function placeTextBoxS4(newTB, tbGeo, boxY, step, scaleNum, doc) {
            // Move entire group to target Y (children move with it)
            var deltaY = boxY - tbGeo.y;
            if (Math.abs(deltaY) > 0.001) {
                newTB.move(undefined, [0, deltaY]);
            }

            var currentTop = newTB.geometricBounds[0]; // top after move

            var titleFrame = findChildByName(newTB, "Text_Title");
            var bodyFrame  = findChildByName(newTB, "Text_Body");

            if (!titleFrame || !bodyFrame) {
                $.writeln("S4 warning: could not find Text_Title or Text_Body in " + newTB.name);
            }

            var titleBottom = currentTop + 26; // fallback
            var bodyBottom  = currentTop + 26;

            if (titleFrame) {
                titleBottom = placeChildFrame(titleFrame, currentTop, step.title, scaleNum, doc);
            }
            if (bodyFrame) {
                bodyBottom = placeChildFrame(bodyFrame, currentTop, step.body, scaleNum, doc);
            }

            // Equalize both child frames to the tallest child's bottom
            var outerBottom = Math.max(titleBottom, bodyBottom);
            if (titleFrame) {
                var tB = titleFrame.geometricBounds;
                titleFrame.geometricBounds = [tB[0], tB[1], outerBottom, tB[3]];
            }
            if (bodyFrame) {
                var bB = bodyFrame.geometricBounds;
                bodyFrame.geometricBounds = [bB[0], bB[1], outerBottom, bB[3]];
            }
            var outerB = newTB.geometricBounds;
            newTB.geometricBounds = [outerB[0], outerB[1], outerBottom, outerB[3]];

            return outerBottom;
        }

        // =====================================================
        // ENTRY POINT
        // =====================================================
        var doc;
        var docError = false;

        try {
            doc = app.activeDocument;
        } catch (e) {
            alert(
                "No active InDesign document found.\n\n" +
                "Please open your flowchart document and run the script again."
            );
            docError = true;
        }

        // --- Pre-flight: resolve active page and detect scale from its master ---
        var activePage    = null;
        var detectedScale = null;

        if (!docError) {
            try {
                activePage = app.activeWindow.activePage;
            } catch (e) {
                alert(
                    "Could not determine the active page.\n\n" +
                    "Please ensure a document page is active and run the script again."
                );
                docError = true;
            }
        }

        if (!docError) {
            detectedScale = detectScaleFromPage(activePage);
            if (!detectedScale) {
                var _masterInfo = "";
                try {
                    if (activePage.appliedMaster && activePage.appliedMaster.isValid) {
                        _masterInfo = "\n\nApplied master: \"" + activePage.appliedMaster.name + "\"";
                    } else {
                        _masterInfo = "\n\nThe active page has no master applied.";
                    }
                } catch (e) {}
                alert(
                    "Could not detect a flowchart scale (S1/S2/S3/S4) from the active page’s master." +
                    _masterInfo +
                    "\n\nNavigate to a page with a flowchart master applied and run the script again."
                );
                docError = true;
            }
        }

        if (!docError) {
            // --- Phase 1: Dialog ---
            var result = buildDialog(doc, activePage, detectedScale);
            if (!result) { docError = true; } // user cancelled

            // --- Override master items so locked items become editable ---
            if (!docError) {
                try { result.workingPage.parent.overrideAllMasterPageItems(); } catch (e) {}
            }

            // --- Phase 2: Template object detection ---
            if (!docError) {
                var templateData = detectTemplateObjects(
                    doc, result.workingPage, result.scale
                );
                if (!templateData) { docError = true; }
            }

            // --- Title population (between Phase 2 and 3) ---
            if (!docError && result.title) {
                setFlowchartTitle(result.workingPage, result.title);
            }

            // --- S4 header population (Text_T1 / Text_T2) ---
            if (!docError && result.scale === "S4" && result.s4Header) {
                var hdr = result.s4Header;
                if (hdr.t1 && hdr.t1.replace(/\s/g, "") !== "") {
                    var t1Item = findItem(result.workingPage, function (item) {
                        return item.name === "Text_T1";
                    });
                    if (t1Item) { try { t1Item.contents = hdr.t1; } catch (e) {} }
                }
                if (hdr.t2 && hdr.t2.replace(/\s/g, "") !== "") {
                    var t2Item = findItem(result.workingPage, function (item) {
                        return item.name === "Text_T2";
                    });
                    if (t2Item) { try { t2Item.contents = hdr.t2; } catch (e) {} }
                }
            }

            // --- Phase 3: Duplicate, inject, position ---
            if (!docError) {
                var log = executePhase3(
                    doc, result.workingPage, result, templateData
                );

                // QA Stage 3 — verify positions before removing this alert
                alert(
                    "=== Phase 3 QA -- Layout Log ===\n\n" +
                    "Scale     : " + result.scale + "\n" +
                    "Boxes     : " + result.steps.length + "\n" +
                    "scaleOffset: " + (result.scale === "S1" ? "6.5" : "13") + " pt (S3 defaults to 13)\n\n" +
                    "Stacking (all values in doc units):\n" +
                    log.join("\n") + "\n\n" +
                    "Check in InDesign:\n" +
                    "  - 19.5 pt gap between each box bottom and next box top\n" +
                    "  - Arrow top = preceding box bottom + 13 pt\n" +
                    "  - No arrow below the final box\n" +
                    "  - Text is visible and correctly styled in each box"
                );
            }
        }

    } catch (globalErr) {
        alert("Script error: " + globalErr.message + "\n\nLine: " + globalErr.line);
    }

})();

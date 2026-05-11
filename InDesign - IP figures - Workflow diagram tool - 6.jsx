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
        // CSV PARSER -- multi-column grid format
        // Parses CSV into a 2D array grid[row][col].
        // Shorter rows are padded with "" to match the longest row.
        // Internal newlines in cells are converted to \r for InDesign.
        // =====================================================
        function parseCSVGrid(file) {
            file.open("r");
            var raw = file.read();
            file.close();
            raw = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
            var pos = 0, len = raw.length;

            function readField() {
                if (pos >= len) { return null; }
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
                return val.replace(/\n/g, "\r");
            }

            var grid = [];
            while (pos < len) {
                var row = [];
                var field = readField();
                if (field === null) { break; }
                row.push(field);
                while (pos < len && raw.charAt(pos) === ",") {
                    pos++;
                    var f = readField();
                    row.push(f !== null ? f : "");
                }
                if (pos < len && raw.charAt(pos) === "\n") { pos++; }
                // Skip completely blank rows
                var rowBlank = true;
                for (var ri = 0; ri < row.length; ri++) {
                    if (row[ri].replace(/[\r\n\s]/g, "") !== "") { rowBlank = false; break; }
                }
                if (!rowBlank) { grid.push(row); }
            }

            // Pad shorter rows to match the widest
            var numCols = 0;
            for (var r = 0; r < grid.length; r++) {
                if (grid[r].length > numCols) { numCols = grid[r].length; }
            }
            for (var r2 = 0; r2 < grid.length; r2++) {
                while (grid[r2].length < numCols) { grid[r2].push(""); }
            }
            return grid;
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

            var DIALOG_HEIGHT = 520; // logical px - raise or lower to taste
            var VISIBLE_STEPS = 5;  // step rows shown at once; scroll appears beyond this
            dlg.preferredSize = [-1, DIALOG_HEIGHT];

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
            titleInput.helpTip     = "Replaces content of Text_Header on the working page";

            // ---- Shared state - assigned in the conditional block below ----
            var rows           = null; // S1/S2/S3 pool row objects
            var s4Rows         = null; // S4 pool row objects
            var s4T1Input      = null; // S4 Title-1 header input
            var s4T2Input      = null; // S4 Title-2 header input
            var populateRowsS4 = null; // replace S4 step data from an array and re-render
            // S1/S2/S3 virtual-list state:
            var stepData       = null; // all step text values
            var scrollOffset   = 0;
            var syncToData     = null;
            var renderRows     = null;
            // S4 virtual-list state (mirrors S1/S2/S3 pattern):
            var s4StepData     = null; // all S4 step objects [{title, body}]
            var s4ScrollOffset = 0;
            var syncToDataS4   = null;
            var renderRowsS4   = null;

            if (detectedScale === "S4") {
                // ================================================================
                // S4 PANEL - fixed-pool, same architecture as S1/S2/S3 panel.
                // s4StepData[] is the data store; VISIBLE_STEPS DOM rows are built
                // once and never removed. renderRowsS4() updates content in-place.
                // ================================================================
                s4StepData     = [{ title: "", body: "" }];
                s4ScrollOffset = 0;
                s4Rows         = [];

                var s4Panel = dlg.add("panel", undefined, "S4 Flowchart Steps");
                s4Panel.orientation   = "column";
                s4Panel.alignChildren = ["fill", "top"];
                s4Panel.spacing       = 8;
                s4Panel.margins       = [10, 18, 10, 10];

                // Title 1 / Title 2 header inputs - not scrolled, always visible
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

                // Step rows + scrollbar sit side-by-side
                var s4ScrollWrapper = s4Panel.add("group");
                s4ScrollWrapper.orientation   = "row";
                s4ScrollWrapper.alignChildren = ["left", "top"];
                s4ScrollWrapper.spacing       = 4;

                var s4RowContainer = s4ScrollWrapper.add("group");
                s4RowContainer.orientation   = "column";
                s4RowContainer.alignChildren = ["fill", "top"];
                s4RowContainer.spacing       = 8;

                var s4Scrollbar = s4ScrollWrapper.add("scrollbar", undefined, 0, 0, 0);
                s4Scrollbar.minimumSize = [16, VISIBLE_STEPS * 78];
                s4Scrollbar.maximumSize = [16, VISIBLE_STEPS * 78];
                s4Scrollbar.stepdelta   = 1;
                s4Scrollbar.jumpdelta   = VISIBLE_STEPS;
                s4Scrollbar.visible     = false;

                // Build the fixed pool of VISIBLE_STEPS S4 rows
                var s4pi;
                for (s4pi = 0; s4pi < VISIBLE_STEPS; s4pi++) {
                    (function () {
                        var row = s4RowContainer.add("group");
                        row.orientation   = "row";
                        row.alignChildren = ["left", "top"];
                        row.spacing       = 6;

                        var lbl = row.add("statictext", undefined, "1.");
                        lbl.minimumSize = [22, 20];

                        var titleGroup = row.add("group");
                        titleGroup.orientation   = "column";
                        titleGroup.alignChildren = ["left", "top"];
                        titleGroup.spacing       = 2;
                        titleGroup.add("statictext", undefined, "Title");
                        var titleField = titleGroup.add("edittext", undefined, "", { multiline: true });
                        titleField.minimumSize = [135, 46];
                        titleField.maximumSize = [135, 46];

                        var bodyGroup = row.add("group");
                        bodyGroup.orientation   = "column";
                        bodyGroup.alignChildren = ["left", "top"];
                        bodyGroup.spacing       = 2;
                        bodyGroup.add("statictext", undefined, "Body");
                        var bodyField = bodyGroup.add("edittext", undefined, "", { multiline: true });
                        bodyField.minimumSize = [135, 46];
                        bodyField.maximumSize = [135, 46];

                        var removeBtn = row.add("button", undefined, "x");
                        removeBtn.minimumSize = [26, 22];
                        removeBtn.maximumSize = [26, 22];

                        var rowObj = {
                            group      : row,
                            titleField : titleField,
                            bodyField  : bodyField,
                            indexLabel : lbl,
                            removeBtn  : removeBtn,
                            dataIndex  : -1
                        };

                        removeBtn.onClick = function () {
                            var di = rowObj.dataIndex;
                            if (di < 0 || di >= s4StepData.length) { return; }
                            syncToDataS4();
                            if (s4StepData.length === 1) {
                                s4StepData[0] = { title: "", body: "" };
                                s4Rows[0].titleField.text = "";
                                s4Rows[0].bodyField.text  = "";
                                dlg.update();
                                return;
                            }
                            s4StepData.splice(di, 1);
                            s4ScrollOffset = Math.min(
                                s4ScrollOffset,
                                Math.max(0, s4StepData.length - VISIBLE_STEPS)
                            );
                            renderRowsS4();
                        };

                        s4Rows.push(rowObj);
                    })();
                }

                syncToDataS4 = function () {
                    for (var k = 0; k < s4Rows.length; k++) {
                        var di = s4Rows[k].dataIndex;
                        if (di >= 0 && di < s4StepData.length) {
                            s4StepData[di] = {
                                title: s4Rows[k].titleField.text,
                                body:  s4Rows[k].bodyField.text
                            };
                        }
                    }
                };

                renderRowsS4 = function () {
                    var k;
                    for (k = 0; k < VISIBLE_STEPS; k++) {
                        var rowObj  = s4Rows[k];
                        var dataIdx = s4ScrollOffset + k;
                        if (dataIdx < s4StepData.length) {
                            rowObj.dataIndex           = dataIdx;
                            rowObj.indexLabel.text     = (dataIdx + 1) + ".";
                            rowObj.titleField.text     = s4StepData[dataIdx].title;
                            rowObj.bodyField.text      = s4StepData[dataIdx].body;
                            rowObj.titleField.enabled  = true;
                            rowObj.titleField.readonly = false;
                            rowObj.bodyField.enabled   = true;
                            rowObj.bodyField.readonly  = false;
                            rowObj.removeBtn.enabled   = true;
                        } else {
                            rowObj.dataIndex           = -1;
                            rowObj.indexLabel.text     = "";
                            rowObj.titleField.text     = "";
                            rowObj.bodyField.text      = "";
                            rowObj.titleField.enabled  = false;
                            rowObj.titleField.readonly = true;
                            rowObj.bodyField.enabled   = false;
                            rowObj.bodyField.readonly  = true;
                            rowObj.removeBtn.enabled   = false;
                        }
                    }
                    var maxScroll = Math.max(0, s4StepData.length - VISIBLE_STEPS);
                    s4Scrollbar.maxvalue = maxScroll;
                    s4Scrollbar.value    = Math.min(s4ScrollOffset, maxScroll);
                    s4Scrollbar.visible  = s4StepData.length > VISIBLE_STEPS;
                    dlg.update();
                };

                s4Scrollbar.onChange = function () {
                    syncToDataS4();
                    s4ScrollOffset = Math.round(s4Scrollbar.value);
                    renderRowsS4();
                };

                renderRowsS4(); // seed

                populateRowsS4 = function (values) {
                    s4StepData    = values;
                    s4ScrollOffset = 0;
                    renderRowsS4();
                };

                var addS4StepBtn = s4Panel.add("button", undefined, "+ Add Step");
                addS4StepBtn.alignment   = ["left", "center"];
                addS4StepBtn.minimumSize = [100, 24];
                addS4StepBtn.onClick = function () {
                    syncToDataS4();
                    s4StepData.push({ title: "", body: "" });
                    s4ScrollOffset = Math.max(0, s4StepData.length - VISIBLE_STEPS);
                    renderRowsS4();
                };

            } else {
                // ================================================================
                // STEPS PANEL (S1/S2/S3) - fixed-pool: all VISIBLE_STEPS rows are
                // built once at construction. renderRows() updates content in-place
                // (no DOM mutations, no layout(true)) → no flicker, no size changes.
                // ================================================================
                stepData     = [""];
                scrollOffset = 0;
                rows         = [];

                var stepsPanel = dlg.add("panel", undefined, "Flowchart Steps");
                stepsPanel.orientation   = "column";
                stepsPanel.alignChildren = ["fill", "top"];
                stepsPanel.spacing       = 6;
                stepsPanel.margins       = [10, 18, 10, 10];

                var scrollWrapper = stepsPanel.add("group");
                scrollWrapper.orientation   = "row";
                scrollWrapper.alignChildren = ["left", "top"];
                scrollWrapper.spacing       = 4;

                var rowContainer = scrollWrapper.add("group");
                rowContainer.orientation   = "column";
                rowContainer.alignChildren = ["fill", "top"];
                rowContainer.spacing       = 5;

                var scrollbar = scrollWrapper.add("scrollbar", undefined, 0, 0, 0);
                scrollbar.minimumSize = [16, VISIBLE_STEPS * 51];
                scrollbar.maximumSize = [16, VISIBLE_STEPS * 51];
                scrollbar.stepdelta   = 1;
                scrollbar.jumpdelta   = VISIBLE_STEPS;
                scrollbar.visible     = false;

                // Build the fixed pool - these DOM rows are created once and never removed.
                // Each rowObj.dataIndex tracks which stepData entry this row currently shows;
                // renderRows() updates dataIndex and content in-place without touching the DOM.
                var pi;
                for (pi = 0; pi < VISIBLE_STEPS; pi++) {
                    (function () {
                        var row = rowContainer.add("group");
                        row.orientation   = "row";
                        row.alignChildren = ["left", "top"];
                        row.spacing       = 6;

                        var lbl = row.add("statictext", undefined, "1.");
                        lbl.minimumSize = [22, 20];

                        var input = row.add("edittext", undefined, "", { multiline: true });
                        input.minimumSize = [290, 46];
                        input.maximumSize = [290, 46];

                        var removeBtn = row.add("button", undefined, "x");
                        removeBtn.minimumSize = [26, 22];
                        removeBtn.maximumSize = [26, 22];
                        removeBtn.helpTip     = "Remove this step";

                        var rowObj = {
                            group      : row,
                            inputField : input,
                            indexLabel : lbl,
                            removeBtn  : removeBtn,
                            dataIndex  : -1   // -1 = no backing data (blank/disabled row)
                        };

                        // Read dataIndex at click time - never stale because renderRows updates it
                        removeBtn.onClick = function () {
                            var di = rowObj.dataIndex;
                            if (di < 0 || di >= stepData.length) { return; }
                            syncToData();
                            if (stepData.length === 1) {
                                stepData[0] = "";
                                rows[0].inputField.text = "";
                                dlg.update();
                                return;
                            }
                            stepData.splice(di, 1);
                            scrollOffset = Math.min(
                                scrollOffset,
                                Math.max(0, stepData.length - VISIBLE_STEPS)
                            );
                            renderRows();
                        };

                        rows.push(rowObj);
                    })();
                }

                // Flush visible input content → stepData (only for rows that have backing data)
                syncToData = function () {
                    for (var k = 0; k < rows.length; k++) {
                        var di = rows[k].dataIndex;
                        if (di >= 0 && di < stepData.length) {
                            stepData[di] = rows[k].inputField.text;
                        }
                    }
                };

                // Update pool row content in-place - no DOM mutations, no layout(true).
                // Rows with no backing data are blanked and disabled.
                renderRows = function () {
                    var k;
                    for (k = 0; k < VISIBLE_STEPS; k++) {
                        var rowObj  = rows[k];
                        var dataIdx = scrollOffset + k;
                        if (dataIdx < stepData.length) {
                            rowObj.dataIndex            = dataIdx;
                            rowObj.indexLabel.text      = (dataIdx + 1) + ".";
                            rowObj.inputField.text      = stepData[dataIdx];
                            rowObj.inputField.enabled   = true;
                            rowObj.inputField.readonly  = false;
                            rowObj.removeBtn.enabled    = true;
                        } else {
                            rowObj.dataIndex            = -1;
                            rowObj.indexLabel.text      = "";
                            rowObj.inputField.text      = "";
                            rowObj.inputField.enabled   = false;
                            rowObj.inputField.readonly  = true;
                            rowObj.removeBtn.enabled    = false;
                        }
                    }
                    var maxScroll = Math.max(0, stepData.length - VISIBLE_STEPS);
                    scrollbar.maxvalue = maxScroll;
                    scrollbar.value    = Math.min(scrollOffset, maxScroll);
                    scrollbar.visible  = stepData.length > VISIBLE_STEPS;
                    dlg.update();
                };

                scrollbar.onChange = function () {
                    syncToData();
                    scrollOffset = Math.round(scrollbar.value);
                    renderRows();
                };

                renderRows(); // seed: populate first row from stepData[0]

                var addStepBtn = stepsPanel.add("button", undefined, "+ Add Step");
                addStepBtn.alignment   = ["left", "center"];
                addStepBtn.minimumSize = [100, 24];
                addStepBtn.onClick = function () {
                    syncToData();
                    stepData.push("");
                    scrollOffset = Math.max(0, stepData.length - VISIBLE_STEPS);
                    renderRows();
                };
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
            // S4:       two-column CSV - col A = Title, col B = Body (format unchanged).
            // S1/S2/S3: three-section CSV -
            //   Row 1: scale identifier (S1, S2, or S3)
            //   Row 2: diagram title (populates Diagram Name field)
            //   Rows 3+: flowchart step texts
            csvBtn.onClick = function () {
                try {
                var file = File.openDialog(
                    "Select a CSV file",
                    "CSV Files:*.csv,Text Files:*.txt,All Files:*.*"
                );
                if (!file) { return; }

                var grid = parseCSVGrid(file);

                    if (grid.length === 0 || grid[0].length === 0) {
                        alert("The selected CSV file is empty or contains no readable data.");
                        return;
                    }

                    var numCols    = grid[0].length;
                    var validScales = { S1: true, S2: true, S3: true };
                    var diagrams   = [];  // valid diagram specs
                    var invalids   = [];  // { col, reason }
                    var usedActivePage = false;

                    var findMasterForScale = function (scale) {
                        for (var mi = 0; mi < doc.masterSpreads.length; mi++) {
                            if (doc.masterSpreads[mi].name.indexOf(scale) !== -1) {
                                return doc.masterSpreads[mi];
                            }
                        }
                        return null;
                    };

                    for (var c = 0; c < numCols; c++) {
                        var colNum   = c + 1;
                        var colScale = (grid[0][c] || "").replace(/[\r\n\s]/g, "");
                        var colTitle = (grid.length > 1 ? (grid[1][c] || "") : "").replace(/[\r\n]/g, "").replace(/^\s+|\s+$/g, "");

                        if (colScale === "S4") {
                            var rScale = c + 1 < numCols ? (grid[0][c + 1] || "").replace(/[\r\n\s]/g, "") : "";
                            var rTitle = c + 1 < numCols && grid.length > 1 ? (grid[1][c + 1] || "").replace(/[\r\n]/g, "").replace(/^\s+|\s+$/g, "") : "";
                            if (c + 1 >= numCols || rScale !== "S4") {
                                invalids.push({ col: colNum, reason: "S4 column must be immediately followed by another S4 column" });
                                continue;
                            }
                            if (rTitle !== colTitle) {
                                invalids.push({ col: colNum, reason: "S4 pair TextHeaders must match (col " + colNum + ": \"" + colTitle + "\", col " + (colNum + 1) + ": \"" + rTitle + "\")" });
                                c++;
                                continue;
                            }
                            var s4T1 = grid.length > 2 ? (grid[2][c]     || "") : "";
                            var s4T2 = grid.length > 2 ? (grid[2][c + 1] || "") : "";
                            var s4Steps = [];
                            for (var sr = 3; sr < grid.length; sr++) {
                                var tCell = grid[sr][c]     || "";
                                var bCell = grid[sr][c + 1] || "";
                                if (tCell.replace(/[\r\n\s]/g, "") !== "" || bCell.replace(/[\r\n\s]/g, "") !== "") {
                                    s4Steps.push({ title: tCell, body: bCell });
                                }
                            }
                            if (s4Steps.length === 0) {
                                invalids.push({ col: colNum, reason: "S4 pair has no steps (rows 4+ are all blank)" });
                                c++;
                                continue;
                            }
                            var s4Master = null;
                            if (currentScale === "S4" && !usedActivePage) {
                                usedActivePage = true;
                            } else {
                                s4Master = findMasterForScale("S4");
                                if (!s4Master) {
                                    invalids.push({ col: colNum, reason: "no master spread found for scale S4" });
                                    c++;
                                    continue;
                                }
                            }
                            diagrams.push({ col: colNum, scale: "S4", title: colTitle, s4T1: s4T1, s4T2: s4T2, steps: s4Steps, csvMaster: s4Master });
                            c++;
                            continue;
                        }

                        // Collect non-blank step cells (rows 2+)
                        var colSteps = [];
                        for (var sr = 2; sr < grid.length; sr++) {
                            var cell = grid[sr][c] || "";
                            if (cell.replace(/[\r\n\s]/g, "") !== "") { colSteps.push(cell); }
                        }

                        if (!validScales[colScale]) {
                            invalids.push({ col: colNum, reason: "\"" + colScale + "\" is not a valid scale (must be S1, S2, S3, or S4)" });
                            continue;
                        }
                        if (colSteps.length === 0) {
                            invalids.push({ col: colNum, reason: "no steps found (rows 3+ are all blank)" });
                            continue;
                        }

                        // Determine master: first column whose scale matches the active page
                        // gets activePage; all others (even same scale) get a new page.
                        var colMaster = null;
                        if (colScale === currentScale && !usedActivePage) {
                            colMaster = null; // signal to use activePage in build loop
                            usedActivePage = true;
                        } else {
                            colMaster = findMasterForScale(colScale);
                            if (!colMaster) {
                                invalids.push({ col: colNum, reason: "no master spread found for scale " + colScale });
                                continue;
                            }
                        }

                        diagrams.push({ col: colNum, scale: colScale, title: colTitle, steps: colSteps, csvMaster: colMaster });
                    }

                    // All-or-nothing gate
                    if (invalids.length > 0) {
                        var report = "CSV validation failed — no diagrams will be built.\n";
                        if (diagrams.length > 0) {
                            report += "\nValid columns (" + diagrams.length + "):";
                            for (var vi = 0; vi < diagrams.length; vi++) {
                                report += "\n  Col " + diagrams[vi].col + " — " + diagrams[vi].scale + " \"" + diagrams[vi].title + "\" (" + diagrams[vi].steps.length + " steps)";
                            }
                        }
                        report += "\n\nInvalid columns (" + invalids.length + "):";
                        for (var ii = 0; ii < invalids.length; ii++) {
                            report += "\n  Col " + invalids[ii].col + " — " + invalids[ii].reason;
                        }
                        alert(report);
                        return;
                    }

                    // Group consecutive same-(scale, title) columns onto shared pages
                    var groups = [];
                    if (diagrams.length > 0) {
                        var curGroup = [diagrams[0]];
                        for (var gi = 1; gi < diagrams.length; gi++) {
                            var gPrev = diagrams[gi - 1], gCurr = diagrams[gi];
                            if (gCurr.scale !== "S4" && gPrev.scale !== "S4" &&
                                    gCurr.scale === gPrev.scale && gCurr.title === gPrev.title) {
                                curGroup.push(gCurr);
                            } else {
                                groups.push(curGroup);
                                curGroup = [gCurr];
                            }
                        }
                        groups.push(curGroup);
                    }

                    // Build confirm preview
                    var preview = groups.length + " page" + (groups.length !== 1 ? "s" : "") + " to build:\n";
                    for (var gi = 0; gi < groups.length; gi++) {
                        var g = groups[gi];
                        var pageNote = g[0].csvMaster ? "  (new page)" : "  (active page)";
                        if (g.length === 1) {
                            var d = g[0];
                            preview += "\n  Page " + (gi + 1) + ": " + d.scale + "  \"" + d.title + "\"  — " +
                                d.steps.length + " step" + (d.steps.length !== 1 ? "s" : "") + pageNote;
                        } else {
                            preview += "\n  Page " + (gi + 1) + ": " + g[0].scale + "  \"" + g[0].title +
                                "\"  — " + g.length + " columns side-by-side" + pageNote;
                            for (var ci = 0; ci < g.length; ci++) {
                                preview += "\n    Col " + g[ci].col + ": " + g[ci].steps.length +
                                    " step" + (g[ci].steps.length !== 1 ? "s" : "");
                            }
                        }
                    }

                    if (!confirm("Load from CSV?\n\n" + preview)) { return; }

                    // Page creation deferred to main execution block (InDesign forbids
                    // doc modification while a modal dialog is active).
                    result = { groups: groups };
                    dlg.close();
                } catch (csvErr) {
                    alert("CSV load failed.\n\nError: " + csvErr.message + "\nLine: " + csvErr.line);
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
                    // ---- S4: flush visible fields then collect from s4StepData ----
                    syncToDataS4();
                    var s4Steps = [];
                    for (var i = 0; i < s4StepData.length; i++) {
                        var t = s4StepData[i].title;
                        var b = s4StepData[i].body;
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
                    // ---- S1/S2/S3: flush visible fields then collect from stepData ----
                    syncToData();
                    var steps = [];
                    for (var si = 0; si < stepData.length; si++) {
                        var val = stepData[si];
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
         * Detects both template objects by Layers-panel name prefix.
         *
         * Matching rules (number suffix is ignored):
         *
         *   TextBox - name must:
         *     • start with  "Object_TextBox"
         *     • contain the scale designator  "S1_", "S2_" or "S3_"
         *     e.g. "Object_TextBox_S3_01" matches when scale === "S3"
         *
         *   Arrow - name must:
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
            // Fallback: linear scan across doc.allParagraphStyles.
            // doc.paragraphStyles.item() can fail to resolve styles that sit
            // inside a paragraph style GROUP - doc.allParagraphStyles is a flat
            // JS array that always includes grouped styles regardless of nesting.
            try {
                var all = doc.allParagraphStyles;
                for (var fi = 0; fi < all.length; fi++) {
                    if (all[fi].name === styleName) { return all[fi]; }
                }
            } catch (e2) {}
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
         *  2. Inject full text - \r chars become InDesign paragraph breaks.
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
            // All subsequent passes read from this static array - never
            // from the live DOM collection - so index drift cannot occur.
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
            // A single contents assignment is atomic - no mid-write collection shifts.
            newTB.contents = cleanedTexts.join("\r");

            // Pass C: apply paragraph styles to the now-stable paragraph collection.
            // No contents are modified here so the collection cannot shift.
            $.writeln("[FlowchartBuilder] placeTextBox scaleNum=" + scaleNum);
            for (var q = 0; q < styleNames.length; q++) {
                if (styleNames[q]) {
                    try {
                        var style = getParaStyle(doc, styleNames[q]);
                        $.writeln("  para[" + q + "] styleName=\"" + styleNames[q] + "\" found=" + (style ? "YES" : "NO"));
                        if (style) {
                            newTB.paragraphs[q].appliedParagraphStyle = style;
                        }
                    } catch (e) {
                        $.writeln("  para[" + q + "] ERROR: " + e.message);
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
         * Vertical offset uses arrowOffset - the gap between the template
         * textbox bottom and template arrow bounding-box top - NOT the
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
         * Finds the item named "Text_Header" on the working page
         * (or its master as fallback) and sets its text contents to
         * titleText.
         *
         * Matching is by exact Layers-panel name - case-sensitive.
         * Silently skips if titleText is blank.
         */
        function setFlowchartTitle(workingPage, titleText) {
            if (!titleText || titleText.replace(/\s/g, "") === "") { return; }

            var titleItem = findItem(workingPage, function (item) {
                return item.name === "Text_Header";
            });

            if (!titleItem) {
                alert(
                    "Could not find an object named \"Text_Header\" on the " +
                    "working page or its master.\n\n" +
                    "The diagram name was not applied. Check the Layers panel and " +
                    "confirm the object is named exactly \"Text_Header\" (case-sensitive)."
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
         * After the loop, the original template text box is removed -
         * it would otherwise remain as an invisible empty box overlapping
         * Box 1. The arrow template is left in place (it sits between
         * master-page items and is not duplicated at position 0).
         *
         * Returns a log array for the QA alert.
         */
        function executePhase3(doc, workingPage, result, templateData) {
            var steps       = result.steps;
            var scale       = result.scale;
            var scaleOffset;
            if (scale === "S1") { scaleOffset = 6.5; }
            else                { scaleOffset = 13;  }

            var scaleNum;
            if      (scale === "S1") { scaleNum = "1"; }
            else if (scale === "S2") { scaleNum = "2"; }
            else if (scale === "S3") { scaleNum = "3"; }
            else                     { scaleNum = "4"; }

            var tbTemplate  = templateData.textBox.item;
            var arTemplate  = templateData.arrow.item;
            var tbGeo       = templateData.textBox.geo;
            var arGeo       = templateData.arrow.geo;

            var boxX        = (typeof result.xOffset === "number") ? result.xOffset : tbGeo.x;
            var boxWidth    = tbGeo.w;
            var prevBottom  = null;
            var log         = ["scaleNum=" + scaleNum + "  styles: NumberedList_S" + scaleNum + " / Bullets_S" + scaleNum];

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

            // Remove the original template text box and arrow. Skipped for all but
            // the last column in a multi-column group (the same template seeds every column).
            if (!result.skipTemplateCleanup) {
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
                var allItems = container.allPageItems;
                for (var ai = 0; ai < allItems.length; ai++) {
                    if (allItems[ai].name === name) { return allItems[ai]; }
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
                    "Could not detect a relevant master-page (S1/S2/S3/S4) applied to the active page." +
                    _masterInfo +
                    "\n\nEnsure relevant master-page is applied and run the script again."
                );
                docError = true;
            }
        }

        if (!docError) {
            // --- Phase 1: Dialog ---
            var result = buildDialog(doc, activePage, detectedScale);
            if (!result) { docError = true; } // user cancelled

            if (!docError) {

                if (result.groups) {
                    // ---- Multi-diagram CSV path ----
                    // Page creation happens here (after dialog closed) because InDesign
                    // forbids document modification while a modal dialog is active.
                    var builtCount  = 0;
                    var buildErrors = [];

                    for (var gi = 0; gi < result.groups.length; gi++) {
                        var group     = result.groups[gi];
                        var g0        = group[0];
                        var groupPage = null;

                        if (g0.csvMaster) {
                            try {
                                var newGP = doc.pages.add(LocationOptions.AT_END);
                                newGP.appliedMaster = g0.csvMaster;
                                groupPage = newGP;
                            } catch (e) {
                                buildErrors.push("Page " + (gi + 1) + ": could not create page — " + e.message);
                                break;
                            }
                        } else {
                            groupPage = activePage;
                        }

                        try { groupPage.parent.overrideAllMasterPageItems(); } catch (e) {}

                        var groupTpl = detectTemplateObjects(doc, groupPage, g0.scale);
                        if (!groupTpl) {
                            buildErrors.push("Page " + (gi + 1) + ": template not found for scale " + g0.scale);
                            break;
                        }

                        setFlowchartTitle(groupPage, g0.title);

                        if (g0.scale === "S4") {
                            if (g0.s4T1 && g0.s4T1.replace(/\s/g, "") !== "") {
                                var t1Item = findItem(groupPage, function (item) { return item.name === "Text_T1"; });
                                if (t1Item) { try { t1Item.contents = g0.s4T1; } catch (e) {} }
                            }
                            if (g0.s4T2 && g0.s4T2.replace(/\s/g, "") !== "") {
                                var t2Item = findItem(groupPage, function (item) { return item.name === "Text_T2"; });
                                if (t2Item) { try { t2Item.contents = g0.s4T2; } catch (e) {} }
                            }
                            var s4Spec = { scale: "S4", steps: g0.steps, workingPage: groupPage };
                            executePhase3(doc, groupPage, s4Spec, groupTpl);
                            builtCount++;
                            continue;
                        }

                        var colW  = groupTpl.textBox.geo.w;
                        var colX0 = groupTpl.textBox.geo.x;

                        for (var ci = 0; ci < group.length; ci++) {
                            var colSpec = group[ci];
                            colSpec.workingPage         = groupPage;
                            colSpec.xOffset             = colX0 + ci * (colW + 13);
                            colSpec.skipTemplateCleanup = (ci < group.length - 1);
                            executePhase3(doc, groupPage, colSpec, groupTpl);
                        }
                        builtCount++;
                    }

                    if (buildErrors.length > 0) {
                        alert(
                            "CSV build stopped early.\n\n" +
                            "Built: " + builtCount + " of " + result.groups.length + " pages.\n\n" +
                            "Error:\n" + buildErrors.join("\n")
                        );
                    } else {
                        alert(
                            "CSV build complete.\n\n" +
                            builtCount + " page" + (builtCount !== 1 ? "s" : "") + " built successfully."
                        );
                    }

                } else {
                    // ---- Single-diagram path (manual dialog or legacy) ----

                    // CSV new-page creation deferred from the dialog handler
                    if (result.csvMaster) {
                        try {
                            var csvNewPage = doc.pages.add(LocationOptions.AT_END);
                            csvNewPage.appliedMaster = result.csvMaster;
                            result.workingPage = csvNewPage;
                        } catch (e) {
                            alert("Could not create new page for scale " + result.scale + ":\n\n" + e.message);
                            docError = true;
                        }
                    }

                    if (!docError) {
                        try { result.workingPage.parent.overrideAllMasterPageItems(); } catch (e) {}
                    }

                    if (!docError) {
                        var templateData = detectTemplateObjects(doc, result.workingPage, result.scale);
                        if (!templateData) { docError = true; }
                    }

                    if (!docError && result.title) {
                        setFlowchartTitle(result.workingPage, result.title);
                    }

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

                    if (!docError) {
                        var log = executePhase3(doc, result.workingPage, result, templateData);
                        alert(
                            "=== Phase 3 QA -- Layout Log ===\n\n" +
                            "Scale     : " + result.scale + "\n" +
                            "Boxes     : " + result.steps.length + "\n\n" +
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
            }
        }

    } catch (globalErr) {
        alert("Script error: " + globalErr.message + "\n\nLine: " + globalErr.line);
    }

})();

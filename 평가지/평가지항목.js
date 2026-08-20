// =========================================================================
// 🚀 [신규 코어 엔진] 100% 전체 면적 개방형 2D 매트릭스 엔진 (JSON 기반)
// =========================================================================

window.CustomMatrixEngine = {
    store: {},
    selectedCells: [],
    history: {}, 
    activeTableId: null, 
    editModeMap: {}, // 💡 [신규] 각 표의 '커스텀 모드(전원)' 활성화 상태를 기억하는 저장소

    createInitialGrid: function(rows, cols) {
        let grid = [];
        for (let r = 0; r < rows; r++) {
            let row = [];
            for (let c = 0; c < cols; c++) {
                row.push({
                    text: "",
                    rowspan: 1,
                    colspan: 1,
                    hidden: false,
                    isAns: false,
                    headerColor: false,
                    fontSize: 13,         
                    textAlign: "center",  
                    customHeight: 22,
                    isLocked: false
                });
            }
            grid.push(row);
        }
        return grid;
    },

    initEngine: function(tId, score, itemName) {
        this.store[tId] = { score: score, itemName: itemName, rows: 4, cols: 20, grid: this.createInitialGrid(4, 20) };
        this.history[tId] = []; 
        this.renderTable(tId);
    },

    loadJsonData: function(tId, jsonData) {
        this.store[tId] = jsonData;
        this.history[tId] = [];
        this.renderTable(tId);
    },

    getJsonData: function(tId) { return this.store[tId]; },

    // 💡 [신규] 전원 ON 모터: ✨ 완전커스텀 버튼을 눌렀을 때만 발동
    enterEditMode: function(tId) {
        this.editModeMap[tId] = true;
        this.activeTableId = tId;
        this.updateToolbar();
        this.renderTable(tId);
    },

    // 💡 [신규] 전원 OFF 모터: 💾 저장 또는 ✖ 닫기를 눌렀을 때 발동
    closeEditor: function() {
        if (this.activeTableId) {
            this.editModeMap[this.activeTableId] = false;
        }
        this.activeTableId = null;
        this.selectedCells = [];
        this.updateToolbar();
        Object.keys(this.store).forEach(tId => this.renderTable(tId)); 
    },

    saveHistory: function(tId) {
        if (!this.history[tId]) this.history[tId] = [];
        this.history[tId].push(JSON.stringify(this.store[tId]));
    },

    undo: function() {
        if (this.selectedCells.length === 0) return;
        let tId = this.selectedCells[0].tId;
        
        if (this.history[tId] && this.history[tId].length > 0) {
            let prevState = this.history[tId].pop();
            this.store[tId] = JSON.parse(prevState);
            this.renderTable(tId);
        } else {
            this.clearSelection();
        }
    },

    resetEngine: function() {
        let tId = this.activeTableId;
        if (!tId) return;
        if(!confirm("⚠️ [초기화 경고]\n현재 작업 중인 표를 모두 지우고 4줄 x 20칸 뼈대로 완전히 되돌리시겠습니까?")) return;
        
        this.saveHistory(tId);
        let score = this.store[tId].score;
        let itemName = this.store[tId].itemName;
        this.initEngine(tId, score, itemName);
        this.enterEditMode(tId); // 초기화 후 전원 유지
    },

    renderTable: function(tId) {
        const data = this.store[tId];
        if (!data) return;

        // 현재 표가 커스텀 편집 모드인지 확인
        let isEditMode = this.editModeMap[tId];

        let finalHtml = `<table id="${tId}" class="ep-table trainee-table-target" style="margin-bottom: 0; table-layout: fixed; width: 100%; word-break: break-all; border: 2px solid #000; border-collapse: collapse;">`;
        
        for (let r = 0; r < data.rows; r++) {
            finalHtml += `<tr>`;
            for (let c = 0; c < data.cols; c++) {
                let cell = data.grid[r][c];
                if (cell.hidden) continue;

                let bB = (r + cell.rowspan - 1 < data.rows - 1) ? 'border-bottom:1px solid #000;' : '';
                let bR = (c + cell.colspan - 1 < data.cols - 1) ? 'border-right:1px solid #000;' : '';
                let bg = cell.headerColor ? 'background-color:#f2f2f2;' : 'background-color:transparent;';
                let fw = cell.headerColor ? 'font-weight:bold;' : 'font-weight:normal;';
                
                let ansStyle = cell.isAns ? 'background-color:#fdf2e9; border:2px dashed #e67e22;' : '';
                
                // 💡 에디트 모드가 켜져 있을 때만 노란색 셀렉션 스타일을 입힘
                let isSelected = isEditMode && this.selectedCells.some(sel => sel.tId === tId && sel.r === r && sel.c === c);
                let selClass = isSelected ? 'active-json-cell' : '';
                let selStyle = isSelected ? 'outline: 3px solid #e67e22; outline-offset: -2px; z-index: 10; position: relative; background-color: #ffeaa7 !important;' : '';

                let fSize = cell.fontSize || 13;
                let tAlign = cell.textAlign || "center";
                let cHeight = cell.customHeight || 22;

                let lockStyle = cell.isLocked ? 'user-select:none;' : '';
                
                // 에디트 모드와 관계없이 글자는 수정 가능해야 하므로 pointer-events 락은 해제 상태 유지
                finalHtml += `<td class="json-cell editable-cell ${selClass}" data-tid="${tId}" data-r="${r}" data-c="${c}" 
                                 rowspan="${cell.rowspan}" colspan="${cell.colspan}" tabindex="0"
                                 style="${bB} ${bR} ${bg} ${fw} ${ansStyle} ${selStyle} padding:6px; text-align:${tAlign}; vertical-align:middle; height:${cHeight}px; font-size:${fSize}px; cursor:pointer; transition:0.2s;">
                                 <div contenteditable="${!cell.isLocked}" class="json-cell-editor" style="width:100%; outline:none; min-height:20px; display:inline-block; vertical-align:middle; ${lockStyle}">${cell.text}</div>
                             </td>`;
            }
            finalHtml += `</tr>`;
        }
        finalHtml += `</table>`;

        let wrapper = document.getElementById(`wrapper_${tId}`);
        if (wrapper) {
            wrapper.innerHTML = finalHtml;
            wrapper.setAttribute('data-engine', 'json');
        }
        
        if(typeof window.markChanged === 'function') window.markChanged(tId);
    },

    toggleSelection: function(tId, r, c) {
        let idx = this.selectedCells.findIndex(sel => sel.tId === tId && sel.r === r && sel.c === c);
        if (idx > -1) {
            this.selectedCells.splice(idx, 1);
        } else {
            if (this.selectedCells.length > 0 && this.selectedCells[0].tId !== tId) {
                this.selectedCells = [];
            }
            this.selectedCells.push({tId, r, c});
        }
        this.renderTable(tId);
    },

    clearSelection: function() {
        if (this.selectedCells.length > 0) {
            let tId = this.selectedCells[0].tId;
            this.selectedCells = [];
            this.renderTable(tId);
        }
    },

    updateCellText: function(tId, r, c, text) {
        if (this.store[tId]) {
            this.store[tId].grid[r][c].text = text;
            if(typeof window.markChanged === 'function') window.markChanged(tId);
        }
    },

    editCellText: function() {
        if (this.selectedCells.length !== 1) return;
        let {tId, r, c} = this.selectedCells[0];
        let cellData = this.store[tId].grid[r][c];

        if (cellData.isLocked) return alert("⚠️ 빠른 텍스트가 부여되어 잠긴 셀은 직접 수정할 수 없습니다. (높이 조절은 엔터/백스페이스로 가능합니다)");

        let tdEl = document.querySelector(`.json-cell[data-tid="${tId}"][data-r="${r}"][data-c="${c}"]`);
        if (tdEl) {
            let editor = tdEl.querySelector('.json-cell-editor');
            if (editor) {
                editor.focus();
                if (typeof window.getSelection !== "undefined" && typeof document.createRange !== "undefined") {
                    let range = document.createRange();
                    range.selectNodeContents(editor);
                    range.collapse(false); 
                    let sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            }
        }
    },

    changeFontSize: function(delta) {
        if (this.selectedCells.length === 0) return;
        let tId = this.selectedCells[0].tId;
        this.saveHistory(tId); 
        let data = this.store[tId];
        this.selectedCells.forEach(sel => {
            let cell = data.grid[sel.r][sel.c];
            cell.fontSize = (cell.fontSize || 13) + delta;
        });
        this.renderTable(tId);
    },

    changeTextAlign: function(alignType) {
        if (this.selectedCells.length === 0) return;
        let tId = this.selectedCells[0].tId;
        this.saveHistory(tId); 
        let data = this.store[tId];
        this.selectedCells.forEach(sel => {
            data.grid[sel.r][sel.c].textAlign = alignType;
        });
        this.renderTable(tId);
    },

    mergeCells: function() {
        if (this.selectedCells.length < 2) return alert("⚠️ 병합할 셀을 Ctrl(또는 Shift)키를 누른 채 2개 이상 선택해주세요.");
        let tId = this.selectedCells[0].tId;
        this.saveHistory(tId); 
        let data = this.store[tId];
        
        let minR = Math.min(...this.selectedCells.map(s => s.r));
        let maxR = -1, minC = Math.min(...this.selectedCells.map(s => s.c)), maxC = -1;

        this.selectedCells.forEach(sel => {
            let cell = data.grid[sel.r][sel.c];
            maxR = Math.max(maxR, sel.r + cell.rowspan - 1);
            maxC = Math.max(maxC, sel.c + cell.colspan - 1);
        });

        let topLeftCell = data.grid[minR][minC];
        let mergedText = [];

        for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
                let cell = data.grid[r][c];
                if (!cell.hidden && (r !== minR || c !== minC)) {
                    if (cell.text.trim()) mergedText.push(cell.text);
                    cell.hidden = true;
                    cell.rowspan = 1;
                    cell.colspan = 1;
                    cell.text = "";
                    cell.isLocked = false; 
                }
            }
        }

        topLeftCell.rowspan = maxR - minR + 1;
        topLeftCell.colspan = maxC - minC + 1;
        if (mergedText.length > 0) {
            topLeftCell.text += (topLeftCell.text ? "<br>" : "") + mergedText.join("<br>");
        }

        this.selectedCells = [{tId, r: minR, c: minC}]; 
        this.renderTable(tId);
    },

    splitCell: function() {
        if (this.selectedCells.length !== 1) return;
        let {tId, r, c} = this.selectedCells[0];
        let data = this.store[tId];
        let cell = data.grid[r][c];

        if (cell.rowspan === 1 && cell.colspan === 1) return;
        
        this.saveHistory(tId); 

        for (let i = 0; i < cell.rowspan; i++) {
            for (let j = 0; j < cell.colspan; j++) {
                if (i === 0 && j === 0) continue;
                data.grid[r + i][c + j].hidden = false;
                data.grid[r + i][c + j].isLocked = false; 
            }
        }
        cell.rowspan = 1;
        cell.colspan = 1;
        
        this.selectedCells = [{tId, r, c}]; 
        this.renderTable(tId);
    },

    toggleHeaderColor: function() {
        if (this.selectedCells.length === 0) return;
        let tId = this.selectedCells[0].tId;
        this.saveHistory(tId); 
        let data = this.store[tId];
        this.selectedCells.forEach(sel => {
            data.grid[sel.r][sel.c].headerColor = !data.grid[sel.r][sel.c].headerColor;
        });
        this.renderTable(tId);
    },

    toggleAnswerZone: function() {
        if (this.selectedCells.length === 0) return;
        let tId = this.selectedCells[0].tId;
        this.saveHistory(tId); 
        let data = this.store[tId];
        this.selectedCells.forEach(sel => {
            data.grid[sel.r][sel.c].isAns = !data.grid[sel.r][sel.c].isAns;
        });
        this.renderTable(tId);
    },

    addRow: function() {
        let tId = this.activeTableId;
        if (!tId) return;
        this.saveHistory(tId); 
        let data = this.store[tId];
        
        let insertR = data.rows; 
        if (this.selectedCells.length > 0) {
            let {r, c} = this.selectedCells[0];
            insertR = r + data.grid[r][c].rowspan;
        }

        let newRow = [];
        for (let i = 0; i < data.cols; i++) {
            newRow.push({ text: "", rowspan: 1, colspan: 1, hidden: false, isAns: false, headerColor: false, fontSize: 13, textAlign: "center", customHeight: 22, isLocked: false });
        }
        data.grid.splice(insertR, 0, newRow);
        data.rows++;

        for (let i = 0; i < insertR; i++) {
            for (let j = 0; j < data.cols; j++) {
                let prevCell = data.grid[i][j];
                if (!prevCell.hidden && i + prevCell.rowspan > insertR) {
                    prevCell.rowspan++;
                    data.grid[insertR][j].hidden = true;
                }
            }
        }
        this.selectedCells = [];
        this.renderTable(tId);
    },

    addCol: function() {
        let tId = this.activeTableId;
        if (!tId) return;
        this.saveHistory(tId); 
        let data = this.store[tId];
        
        let insertC = data.cols; 
        if (this.selectedCells.length > 0) {
            let {r, c} = this.selectedCells[0];
            insertC = c + data.grid[r][c].colspan;
        }

        for (let i = 0; i < data.rows; i++) {
            data.grid[i].splice(insertC, 0, { text: "", rowspan: 1, colspan: 1, hidden: false, isAns: false, headerColor: false, fontSize: 13, textAlign: "center", customHeight: 22, isLocked: false });
        }
        data.cols++;

        for (let i = 0; i < data.rows; i++) {
            for (let j = 0; j < insertC; j++) {
                let prevCell = data.grid[i][j];
                if (!prevCell.hidden && j + prevCell.colspan > insertC) {
                    prevCell.colspan++;
                    data.grid[i][insertC].hidden = true;
                }
            }
        }
        this.selectedCells = [];
        this.renderTable(tId);
    },

    insertCheckbox: function() {
        if (this.selectedCells.length === 0) return alert("⚠️ 체크박스를 넣을 셀을 선택해주세요.");
        let {tId, r, c} = this.selectedCells[0];
        let cell = this.store[tId].grid[r][c];
        
        if (cell.isLocked) return alert("⚠️ 빠른 텍스트가 부여되어 잠긴 셀에는 체크박스를 추가할 수 없습니다.");
        
        this.saveHistory(tId);
        let chkHtml = `<span class="custom-chk" style="cursor:pointer; font-weight:bold; color:black;" contenteditable="false">□</span><span style="font-weight:normal;">&nbsp;</span>`;
        cell.text += chkHtml;
        this.renderTable(tId);
    },

    injectTemplate: function() {
        if (this.selectedCells.length === 0) return alert("⚠️ 텍스트를 부여할 셀을 먼저 선택해주세요.");
        
        let tId = this.selectedCells[0].tId;
        this.saveHistory(tId); 
        let data = this.store[tId];
        let val = document.getElementById('json-template-select').value;
        let textToInject = "";

        if (val === "항목") textToInject = "항 목";
        else if (val === "핵심작업명") textToInject = data.itemName;
        else if (val === "항목1") textToInject = "항 목 1";
        else if (val === "항목2") textToInject = "항 목 2";
        else if (val === "이상부위") textToInject = "① 이상 부위";
        else if (val === "내용상태") textToInject = "② 내용 및 상태";
        else if (val === "판정") textToInject = "③ 판 정";
        else if (val === "조치사항") textToInject = "④ 정비 및 조치사항";
        else if (val === "측정값") textToInject = "① 측정값";
        else if (val === "규정값") textToInject = "② 규정값";
        else if (val === "판정2") textToInject = "② 판 정";
        else if (val === "조치사항3") textToInject = "③ 정비 및 조치사항";
        else if (val === "득점") textToInject = `득 점<br><span style="font-weight:normal;">(${data.score}점)</span>`;
        else if (val === "양호불량") textToInject = `<span class="custom-chk" style="cursor:pointer; font-weight:bold; color:black;" contenteditable="false">□</span> <span style="font-weight:normal; color:black;">양호</span><br><span class="custom-chk" style="cursor:pointer; font-weight:bold; color:black;" contenteditable="false">□</span> <span style="font-weight:normal; color:black;">불량</span>`;

        let {r, c} = this.selectedCells[0];
        let cell = data.grid[r][c];
        cell.text = textToInject;
        cell.isLocked = true; 
        
        if (["항목", "항목1", "항목2", "이상부위", "내용상태", "판정", "조치사항", "득점", "측정값", "규정값", "판정2", "조치사항3"].includes(val)) {
            cell.headerColor = true;
        }

        this.renderTable(tId);
    },

    // =========================================================================
    // 📌 우측 고정형 컨트롤 패널 UI 생성 
    // =========================================================================
    updateToolbar: function() {
        let toolbar = document.getElementById('json-engine-toolbar');
        if (!toolbar) {
            toolbar = document.createElement('div');
            toolbar.id = 'json-engine-toolbar';
            toolbar.className = 'no-print';
            
            toolbar.style.cssText = `
                display: none; position: fixed; top: 120px; right: 30px; z-index: 99999; 
                background: #2c3e50; padding: 12px; border-radius: 8px; box-shadow: 0 8px 20px rgba(0,0,0,0.4); 
                flex-direction: column; gap: 8px; width: 180px; box-sizing: border-box;
            `;
            
            toolbar.innerHTML = `
                <div style="color:#f1c40f; font-size:13px; font-weight:bold; border-bottom:1px solid #7f8c8d; padding-bottom:5px; margin-bottom:2px; text-align:center;">
                    🛠️ 커스텀 에디터
                </div>
                
                <button onclick="window.CustomMatrixEngine.resetEngine()" style="background:#e74c3c; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold; width:100%; margin-bottom:4px;">🔄 4x20 전체 초기화</button>
                <button onclick="window.CustomMatrixEngine.undo()" style="background:#f39c12; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold; width:100%;">↩️ 이전 (ESC)</button>
                <div style="display:flex; gap:4px; width:100%;">
                    <button onclick="window.CustomMatrixEngine.mergeCells()" style="flex:1; background:#3498db; color:white; border:none; padding:6px 0; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">병합(M)</button>
                    <button onclick="window.CustomMatrixEngine.splitCell()" style="flex:1; background:#e67e22; color:white; border:none; padding:6px 0; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">분할(M)</button>
                </div>
                <div style="display:flex; gap:4px; width:100%;">
                    <button onclick="window.CustomMatrixEngine.addRow()" style="flex:1; background:#27ae60; color:white; border:none; padding:6px 0; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold; letter-spacing:-1px;">+행(Space)</button>
                    <button onclick="window.CustomMatrixEngine.addCol()" style="flex:1; background:#27ae60; color:white; border:none; padding:6px 0; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">+열(Tab)</button>
                </div>
                
                <div style="height:1px; background:#7f8c8d; margin:2px 0;"></div>
                
                <div style="color:#bdc3c7; font-size:10px; font-weight:bold; margin-bottom:-2px;">텍스트/스타일 제어</div>
                <button onclick="window.CustomMatrixEngine.editCellText()" style="background:#f39c12; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold; width:100%; margin-bottom:4px;">✏️ 텍스트 수정 (Enter)</button>
                
                <div style="display:flex; gap:4px; width:100%;">
                    <button onclick="window.CustomMatrixEngine.changeTextAlign('center')" style="flex:1; background:#ecf0f1; color:#2c3e50; border:1px solid #bdc3c7; padding:4px 0; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">가운데</button>
                    <button onclick="window.CustomMatrixEngine.changeTextAlign('left')" style="flex:1; background:#ecf0f1; color:#2c3e50; border:1px solid #bdc3c7; padding:4px 0; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">좌측</button>
                </div>
                <div style="display:flex; gap:4px; width:100%;">
                    <button onclick="window.CustomMatrixEngine.changeFontSize(0.5)" style="flex:1; background:#ecf0f1; color:#2c3e50; border:1px solid #bdc3c7; padding:4px 0; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">A+ 0.5px</button>
                    <button onclick="window.CustomMatrixEngine.changeFontSize(-0.5)" style="flex:1; background:#ecf0f1; color:#2c3e50; border:1px solid #bdc3c7; padding:4px 0; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">A- 0.5px</button>
                </div>

                <div style="height:1px; background:#7f8c8d; margin:2px 0;"></div>

                <button onclick="window.CustomMatrixEngine.toggleHeaderColor()" style="background:#9b59b6; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold; width:100%;">🎨 회색 머리글</button>
                <button onclick="window.CustomMatrixEngine.toggleAnswerZone()" style="background:#c0392b; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold; width:100%;">🎯 정답구역 지정</button>

                <div style="height:1px; background:#7f8c8d; margin:2px 0;"></div>

                <div style="color:#bdc3c7; font-size:10px; font-weight:bold; margin-bottom:-2px; display:flex; justify-content:space-between; align-items:center;">
                    빠른 텍스트 부여
                    <button onclick="window.CustomMatrixEngine.insertCheckbox()" style="background:#3498db; color:white; border:none; padding:2px 6px; border-radius:3px; cursor:pointer; font-size:10px; font-weight:bold;">☑ 체크박스</button>
                </div>
                <select id="json-template-select" style="width:100%; padding:4px; font-size:11px; border-radius:3px; outline:none; border:1px solid #7f8c8d; margin-bottom:2px;">
                    <option value="핵심작업명">핵심작업명 (자동이름)</option>
                    <option value="득점">득 점 (자동배점)</option>
                    <option value="항목">항 목</option>
                    <option value="항목1">항 목 1</option>
                    <option value="항목2">항 목 2</option>
                    <option value="이상부위">① 이상 부위</option>
                    <option value="내용상태">② 내용 및 상태</option>
                    <option value="판정">③ 판 정</option>
                    <option value="조치사항">④ 정비 및 조치사항</option>
                    <option value="측정값">① 측정값</option>
                    <option value="규정값">② 규정값</option>
                    <option value="판정2">② 판 정</option>
                    <option value="조치사항3">③ 정비 및 조치사항</option>
                    <option value="양호불량">□ 양호 / □ 불량</option>
                </select>
                <button onclick="window.CustomMatrixEngine.injectTemplate()" style="background:#f1c40f; color:#2c3e50; border:none; padding:6px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold; width:100%;">문구 덮어쓰기 및 잠금</button>
                
                <button onclick="window.CustomMatrixEngine.closeEditor()" style="background:#ecf0f1; color:#e74c3c; border:none; padding:6px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold; width:100%; margin-top:5px;">✖ 에디터 닫기</button>
            `;
            document.body.appendChild(toolbar);
        }

        // 💡 [수정] 현재 커스텀 모드(editModeMap)가 켜져 있을 때만 툴바 표시
        if (this.activeTableId && this.editModeMap[this.activeTableId]) {
            toolbar.style.display = 'flex';
        } else {
            toolbar.style.display = 'none';
        }
    }
};

// =========================================================================
// 📡 마우스/키보드 감지 레이더 및 방어막 (Shield)
// =========================================================================

document.addEventListener('click', function(e) {
    // 3번 탭(채점기준) 전용 클릭 방어막
    if (document.getElementById('page3') && document.getElementById('page3').classList.contains('active')) {
        if (e.target.classList.contains('custom-chk')) {
            if (e.target.innerText === '□') {
                e.target.innerText = '☑';
                e.target.style.color = '#c0392b';
            } else {
                e.target.innerText = '□';
                e.target.style.color = 'black';
            }
            e.stopPropagation();
            e.preventDefault();
            return;
        }
        
        let editor = e.target.closest('.json-cell-editor');
        if (editor && editor.style.userSelect === "none") {
            e.stopPropagation();
            return;
        }
        return; 
    }

    // 2번 탭 전용 레이더
    let td = e.target.closest('.json-cell');
    if (td) {
        let tId = td.getAttribute('data-tid');
        
        // 💡 [전원 차단 센서] 저장 버튼이나 닫기 버튼을 눌러서 커스텀 모드가 비활성화되었으면 무시!
        if (!window.CustomMatrixEngine.editModeMap[tId]) return;

        let r = parseInt(td.getAttribute('data-r'));
        let c = parseInt(td.getAttribute('data-c'));
        
        window.CustomMatrixEngine.activeTableId = tId; 
        
        if (e.ctrlKey || e.shiftKey) {
            window.CustomMatrixEngine.toggleSelection(tId, r, c);
        } else {
            window.CustomMatrixEngine.selectedCells = [{tId, r, c}];
            window.CustomMatrixEngine.renderTable(tId); 
        }
    }
}, true); // 캡처링 활성화

document.addEventListener('input', function(e) {
    if (e.target.classList.contains('json-cell-editor')) {
        let td = e.target.closest('.json-cell');
        let tId = td.getAttribute('data-tid');
        let r = parseInt(td.getAttribute('data-r'));
        let c = parseInt(td.getAttribute('data-c'));
        window.CustomMatrixEngine.updateCellText(tId, r, c, e.target.innerHTML);
    }
});

document.addEventListener('keydown', function(e) {
    if (document.getElementById('page3') && document.getElementById('page3').classList.contains('active')) return;

    let engine = window.CustomMatrixEngine;
    
    // 💡 [전원 차단 센서] 에디터 모드가 꺼져있거나 선택된 셀이 없으면 단축키 무시
    if (engine.selectedCells.length === 0 || !engine.activeTableId || !engine.editModeMap[engine.activeTableId]) return;
    
    let isTyping = document.activeElement && document.activeElement.classList.contains('json-cell-editor');
    let {tId, r, c} = engine.selectedCells[0];
    let data = engine.store[tId];
    let cell = data.grid[r][c];

    if (e.key === 'Escape') {
        e.preventDefault();
        if (isTyping) document.activeElement.blur(); 
        else engine.undo(); 
        return;
    }

    if (e.key === 'Enter' && !isTyping && engine.selectedCells.length === 1) {
        e.preventDefault();
        engine.editCellText();
        return;
    }

    let textContent = cell.text.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, '').trim();
    
    if ((e.key === 'Enter' || e.key === 'Backspace') && (textContent === "" || cell.isLocked)) {
        e.preventDefault();
        engine.saveHistory(tId);
        
        let isChanged = false;
        
        if (e.key === 'Enter') {
            for(let i=0; i<data.cols; i++) {
                let targetCell = data.grid[r][i];
                if(!targetCell.hidden && targetCell.rowspan === 1) {
                    targetCell.customHeight = (targetCell.customHeight || 22) + 22;
                    isChanged = true;
                }
            }
        } else if (e.key === 'Backspace') {
            for(let i=0; i<data.cols; i++) {
                let targetCell = data.grid[r][i];
                if(!targetCell.hidden && targetCell.rowspan === 1) {
                    if ((targetCell.customHeight || 22) > 22) {
                        targetCell.customHeight -= 22;
                        isChanged = true;
                    }
                }
            }
        }
        
        if (isChanged) {
            engine.renderTable(tId);
            setTimeout(() => {
                let focusTarget = document.querySelector(`.json-cell[data-tid="${tId}"][data-r="${r}"][data-c="${c}"]`);
                if (focusTarget) {
                    if(!cell.isLocked) focusTarget.querySelector('.json-cell-editor').focus();
                    engine.selectedCells = [{tId, r, c}]; 
                }
            }, 0);
        }
        return;
    }

    if (e.key === 'Tab') { e.preventDefault(); engine.addCol(); return; }
    if (e.key.toLowerCase() === 'm') {
        if (engine.selectedCells.length >= 2) { e.preventDefault(); engine.mergeCells(); } 
        else if (!isTyping && !cell.isLocked) { e.preventDefault(); engine.splitCell(); }
        return;
    }
    if (e.key === ' ') {
        if (!isTyping && !cell.isLocked) { e.preventDefault(); engine.addRow(); return; }
    }
});
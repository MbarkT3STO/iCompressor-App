const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'src', 'renderer', 'styles', 'layout.css');
let css = fs.readFileSync(cssPath, 'utf8');

const overrides = `
/* --- Browse Search Responsive Overrides --- */
.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-left {
  flex: 1;
  min-width: 250px;
}

.browse-search-container {
  flex: 1 !important;
  max-width: 400px !important;
  min-width: 150px !important;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.05);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.browse-search-container:focus-within {
  border-color: var(--color-accent) !important;
  box-shadow: 0 0 0 3px rgba(var(--color-accent-rgb), 0.2), inset 0 2px 4px rgba(0, 0, 0, 0.1) !important;
  transform: translateY(-1px) !important;
  background: var(--premium-item-hover) !important;
}

@media (max-width: 750px) {
  .browse-table-toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }
  
  .toolbar-left, .toolbar-right {
    width: 100%;
    justify-content: space-between;
  }
  
  .browse-search-container {
    max-width: none !important;
    order: 3;
    width: 100%;
    margin-top: 8px;
    flex: 1 1 100% !important;
  }
  
  .toolbar-left {
    flex-wrap: wrap;
  }
}
`;

fs.appendFileSync(cssPath, overrides);
console.log("CSS appended successfully!");

/*========================================================= 
   BillStation POS — export.js
   Excel export using SheetJS (xlsx CDN)
   ========================================================= */

function downloadReport() {
    if (typeof XLSX === 'undefined') {
        showToast('SheetJS not loaded. Check internet connection.', 'error');
        return;
    }

    const wb = XLSX.utils.book_new();
    const menu = Storage.getMenu();
    const sales = Storage.getSalesLog();

    // ---- Sheet 1: MENU ----
    const menuData = [
        ['Item Name', 'Price (₹)', 'Total Sold'],
        ...menu.map(i => [i.name, i.price, i.totalSold || 0])
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(menuData);
    ws1['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 12 }];
    styleHeaderRow(ws1, menuData[0].length);
    XLSX.utils.book_append_sheet(wb, ws1, 'Menu');

    // ---- Sheet 2: SALES LOG ----
    const salesData = [
        ['Item', 'Quantity', 'Unit Price (₹)', 'Total (₹)', 'Date & Time'],
        ...sales.map(s => [
            s.item,
            s.quantity,
            s.price,
            s.total,
            new Date(s.datetime).toLocaleString('en-IN'),
        ])
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(salesData);
    ws2['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 22 }];
    styleHeaderRow(ws2, salesData[0].length);
    XLSX.utils.book_append_sheet(wb, ws2, 'Sales Log');

    // ---- Sheet 3: SUMMARY ----
    const summaryMap = {};
    sales.forEach(s => {
        if (!summaryMap[s.item]) {
            summaryMap[s.item] = { name: s.item, qty: 0, revenue: 0 };
        }
        summaryMap[s.item].qty += s.quantity;
        summaryMap[s.item].revenue += s.total;
    });

    const summaryData = [
        ['Item', 'Total Sold', 'Total Revenue (₹)'],
        ...Object.values(summaryMap)
        .sort((a, b) => b.qty - a.qty)
        .map(s => [s.name, s.qty, s.revenue.toFixed(2)])
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(summaryData);
    ws3['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 20 }];
    styleHeaderRow(ws3, summaryData[0].length);
    XLSX.utils.book_append_sheet(wb, ws3, 'Summary');

    // =========================================================
    // ---- Sheet 4: ANALYTICS ----
    // =========================================================
    let totalRevenue = 0;
    let totalItems = 0;

    sales.forEach(s => {
        totalRevenue += s.total;
        totalItems += s.quantity;
    });

    const totalBills = new Set(sales.map(s => s.datetime)).size;
    const avgBillValue = totalBills ? (totalRevenue / totalBills) : 0;

    const analyticsData = [
        ['Metric', 'Value'],
        ['Total Revenue (₹)', totalRevenue.toFixed(2)],
        ['Total Items Sold', totalItems],
        ['Total Bills', totalBills],
        ['Average Bill Value (₹)', avgBillValue.toFixed(2)]
    ];

    const ws4 = XLSX.utils.aoa_to_sheet(analyticsData);
    ws4['!cols'] = [{ wch: 28 }, { wch: 18 }];
    styleHeaderRow(ws4, analyticsData[0].length);
    XLSX.utils.book_append_sheet(wb, ws4, 'Analytics');

    // =========================================================
    // ---- Sheet 5: BILL GENERATED ----
    // =========================================================
    const billMap = {};

    sales.forEach(s => {
        if (!billMap[s.datetime]) {
            billMap[s.datetime] = {
                datetime: s.datetime,
                items: 0,
                total: 0
            };
        }
        billMap[s.datetime].items += s.quantity;
        billMap[s.datetime].total += s.total;
    });

    const billData = [
        ['Bill No', 'Items Count', 'Total Amount (₹)', 'Date & Time'],
        ...Object.values(billMap).map((b, i) => [
            i + 1,
            b.items,
            b.total.toFixed(2),
            new Date(b.datetime).toLocaleString('en-IN')
        ])
    ];

    const ws5 = XLSX.utils.aoa_to_sheet(billData);
    ws5['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 24 }];
    styleHeaderRow(ws5, billData[0].length);
    XLSX.utils.book_append_sheet(wb, ws5, 'Bills');

    // Write and download
    const date = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
    XLSX.writeFile(wb, `BillStation_Report_${date}.xlsx`);
    showToast('Report exported successfully!', 'success');
}

function styleHeaderRow(ws, numCols) {
    for (let c = 0; c < numCols; c++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c });
        if (ws[addr]) {
            ws[addr].s = {
                font: { bold: true },
                fill: { fgColor: { rgb: 'F5A623' } },
                alignment: { horizontal: 'center' }
            };
        }
    }
}
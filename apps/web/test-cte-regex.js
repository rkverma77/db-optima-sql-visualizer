const sql = `
WITH LineItems AS (
    -- CTE 1: Denormalize the core order details and calculate revenue per line
    SELECT
        o.id AS order_id,
        o.order_date
    FROM Orders o
),
CustomerAnalytics AS (
    -- CTE 2
    SELECT * FROM Customers
),
SalesRepRanking AS (
    SELECT * FROM Employees
)
SELECT * FROM LineItems;
`;

function extractCTE(sql, cteName) {
    const regex = new RegExp("\\\\b" + cteName + "\\\\s+AS\\\\s*\\\\(", "i");
    const match = sql.match(regex);
    if (!match) return "";
    
    const startIndex = match.index + match[0].length;
    let openParens = 1;
    let i = startIndex;
    for (; i < sql.length; i++) {
        if (sql[i] === '(') openParens++;
        else if (sql[i] === ')') openParens--;
        
        if (openParens === 0) {
            break;
        }
    }
    
    return sql.substring(startIndex, i).trim();
}

console.log("LineItems:", extractCTE(sql, "LineItems"));
console.log("CustomerAnalytics:", extractCTE(sql, "CustomerAnalytics"));
console.log("SalesRepRanking:", extractCTE(sql, "SalesRepRanking"));

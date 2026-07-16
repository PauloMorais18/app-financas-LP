export type TransactionType = "income" | "expense";
export type TransactionStatus = "paid" | "pending" | "cancelled";
export interface Transaction { id:string; date:string; description:string; category:string; type:TransactionType; value:number; paymentMethod:string; status:TransactionStatus; observation?:string; recurring:boolean; owner:string }

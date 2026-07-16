export type Transaction={id:string;date:string;description:string;category:string;type:"income"|"expense";value:number;paymentMethod:string;status:"paid"|"pending"|"cancelled";observation?:string;recurring:boolean;owner:string};
export type TransactionInput=Omit<Transaction,"id">;
export type Category={id:string;name:string;kind:"income"|"expense"|"both";icon:string};

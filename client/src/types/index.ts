export type Transaction={id:string;userId:string;date:string;description:string;category:string;type:"income"|"expense";value:number;paymentMethod:string;status:"paid"|"pending"|"cancelled";observation?:string;recurring:boolean;createdAt?:string;updatedAt?:string};
export type TransactionInput=Omit<Transaction,"id">;
export type AppUser={id:string;name:string;email:string;active:boolean;createdAt:string;updatedAt:string};
export type Category={id:string;name:string;kind:"income"|"expense"|"both";icon:string};

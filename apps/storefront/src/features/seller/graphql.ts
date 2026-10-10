export const REGISTER_SELLER_MUTATION = `
  mutation RegisterSeller($input: RegisterSellerInput!) {
    registerSeller(input: $input) {
      success
      message
      profile {
        id
        businessName
        slug
        address
        contactPhone
        status
        paymentModalities {
          payphone
          deuna
          paypal
          transferenciaBancaria
          pagoEnLocal
        }
      }
    }
  }
`;

import { Receipt, ItemStatus } from '../types/Receipt';

export const mockReceipt12: Receipt = {
  id: 'receipt-001',
  restaurantName: 'The Green Kitchen',
  restaurantAddress: '123 Main Street, San Francisco, CA 94102',
  date: '2024-01-15T19:30:00Z',
  items: [
    {
      id: 'item-001',
      name: 'Margherita Pizza',
      description: 'Fresh mozzarella, basil, tomato sauce',
      price: 18.99,
      quantity: 1,
      status: ItemStatus.PAID,
      claimers: [
        { name: 'Alice', quantity: 1, paid: true }
      ]
    },
    {
      id: 'item-002',
      name: 'Caesar Salad',
      description: 'Romaine lettuce, parmesan, croutons, caesar dressing',
      price: 12.50,
      quantity: 1,
      status: ItemStatus.AVAILABLE,
      claimers: []
    },
    {
      id: 'item-003',
      name: 'Craft Beer',
      description: 'Local IPA - 16oz',
      price: 7.00,
      quantity: 3,
      status: ItemStatus.PENDING,
      claimers: [
        { name: 'Bob', quantity: 2, paid: false },
        { name: 'Alice', quantity: 1, paid: true }
      ]
    },
    {
      id: 'item-004',
      name: 'Garlic Bread',
      description: 'Homemade bread with garlic butter',
      price: 6.99,
      quantity: 2,
      status: ItemStatus.PENDING,
      claimers: [
        { name: 'Charlie', quantity: 1, paid: false }
      ]
    },
    {
      id: 'item-005',
      name: 'Tiramisu',
      description: 'Classic Italian dessert',
      price: 8.50,
      quantity: 1,
      status: ItemStatus.PAID,
      claimers: [
        { name: 'Charlie', quantity: 1, paid: true }
      ]
    }
  ],
  subtotal: 60.98,
  tax: 5.49,
  tip: 12.20,
  total: 78.67
};

export const mockReceipt: Receipt = {
  id: 'receipt-002',
  restaurantName: 'The Krusty Krab',
  restaurantAddress: '831 Bottom Feeder Lane, Bikini Bottom, Pacific Ocean',
  date: '2024-01-20T12:15:00Z',
  items: [
    {
      id: 'item-006',
      name: 'Krabby Patty Deluxe',
      description: 'Secret formula burger with special sauce',
      price: 15.99,
      quantity: 2,
      status: ItemStatus.PAID,
      claimers: [
        { name: 'SpongeBob', quantity: 1, paid: true },
        { name: 'Patrick', quantity: 1, paid: true }
      ]
    },
    {
      id: 'item-007',
      name: 'Kelp Shake',
      description: 'Refreshing seaweed smoothie',
      price: 4.50,
      quantity: 4,
      status: ItemStatus.PENDING,
      claimers: [
        { name: 'Sandy', quantity: 1, paid: true },
        { name: 'Squidward', quantity: 2, paid: false },
        { name: 'Mr. Krabs', quantity: 1, paid: false }
      ]
    },
    {
      id: 'item-008',
      name: 'Barnacle Rings',
      description: 'Crispy onion rings from the deep',
      price: 8.75,
      quantity: 1,
      status: ItemStatus.AVAILABLE,
      claimers: []
    },
    {
      id: 'item-009',
      name: 'Plankton Special',
      description: 'Tiny but mighty appetizer platter',
      price: 6.25,
      quantity: 3,
      status: ItemStatus.PENDING,
      claimers: [
        { name: 'Plankton', quantity: 1, paid: false },
        { name: 'Karen', quantity: 1, paid: true }
      ]
    },
    {
      id: 'item-010',
      name: 'Jellyfish Jelly Pie',
      description: 'Sweet pie made with authentic jellyfish jelly',
      price: 12.00,
      quantity: 1,
      status: ItemStatus.PAID,
      claimers: [
        { name: 'SpongeBob', quantity: 1, paid: true }
      ]
    },
    {
      id: 'item-011',
      name: 'Kelpsi Cola',
      description: 'Fizzy underwater cola drink',
      price: 3.25,
      quantity: 6,
      status: ItemStatus.PENDING,
      claimers: [
        { name: 'Patrick', quantity: 2, paid: false },
        { name: 'Sandy', quantity: 1, paid: true },
        { name: 'Gary', quantity: 1, paid: true }
      ]
    }
  ],
  subtotal: 78.49,
  tax: 7.06,
  tip: 15.70,
  total: 101.25
};

export const mockReceipt3: Receipt = {
  id: 'receipt-003',
  restaurantName: 'Ichiraku Ramen',
  restaurantAddress: '7 Hokage Rock View, Hidden Leaf Village, Fire Country',
  date: '2024-01-25T20:45:00Z',
  items: [
    {
      id: 'item-012',
      name: 'Miso Ramen Special',
      description: 'Naruto\'s favorite! Rich miso broth with extra chashu',
      price: 14.50,
      quantity: 4,
      status: ItemStatus.PENDING,
      claimers: [
        { name: 'Naruto', quantity: 2, paid: false },
        { name: 'Sasuke', quantity: 1, paid: true },
        { name: 'Sakura', quantity: 1, paid: true }
      ]
    },
    {
      id: 'item-013',
      name: 'Chicken Teriyaki Bowl',
      description: 'Grilled chicken over steamed rice with vegetables',
      price: 12.75,
      quantity: 2,
      status: ItemStatus.PAID,
      claimers: [
        { name: 'Kakashi', quantity: 1, paid: true },
        { name: 'Shikamaru', quantity: 1, paid: true }
      ]
    },
    {
      id: 'item-014',
      name: 'Tempura Udon',
      description: 'Thick udon noodles in dashi broth with crispy tempura',
      price: 13.25,
      quantity: 1,
      status: ItemStatus.AVAILABLE,
      claimers: []
    },
    {
      id: 'item-015',
      name: 'Gyoza Dumplings',
      description: 'Pan-fried pork dumplings (6 pieces)',
      price: 8.00,
      quantity: 3,
      status: ItemStatus.PENDING,
      claimers: [
        { name: 'Choji', quantity: 2, paid: false },
        { name: 'Ino', quantity: 1, paid: true }
      ]
    },
    {
      id: 'item-016',
      name: 'Green Tea Ice Cream',
      description: 'Traditional matcha flavored dessert',
      price: 5.50,
      quantity: 2,
      status: ItemStatus.PAID,
      claimers: [
        { name: 'Hinata', quantity: 1, paid: true },
        { name: 'Tenten', quantity: 1, paid: true }
      ]
    },
    {
      id: 'item-017',
      name: 'Sake (Hot)',
      description: 'Premium junmai sake served warm',
      price: 7.25,
      quantity: 5,
      status: ItemStatus.PENDING,
      claimers: [
        { name: 'Jiraiya', quantity: 2, paid: true },
        { name: 'Tsunade', quantity: 1, paid: false },
        { name: 'Rock Lee', quantity: 1, paid: false }
      ]
    },
    {
      id: 'item-018',
      name: 'Yakitori Skewers',
      description: 'Grilled chicken skewers with tare sauce (4 pieces)',
      price: 9.75,
      quantity: 2,
      status: ItemStatus.AVAILABLE,
      claimers: []
    }
  ],
  subtotal: 95.25,
  tax: 8.57,
  tip: 19.05,
  total: 122.87
};
import api from "../libs/axios"

export async function testAPI() {
    const response = await api.get('')
    return response.data
}